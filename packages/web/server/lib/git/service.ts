import { z } from 'zod';
import { simpleGit } from 'simple-git';
import { createSerialRefresh } from './serial-refresh.js';
import { stripAppImageLauncherEnv } from '../inherited-env.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import crypto from 'node:crypto';
import { fingerprintRemoteUrl } from '../source-control/url-redaction.js';
<<<<<<< HEAD:packages/web/server/lib/git/service.js
import { addChangeIdToHead, readCommitChangeId } from '../source-control/change-id.js';
import { createProjectIdFromPath } from '../projects/project-id.js';
import { resolveWorktreeDirectory } from './worktree-directory.js';
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
import { readWorktreeDirectorySetting } from '../opencode/shared.js';
import { readProjectStartCommand } from '../opencode/project-start-command.js';
=======
import { readWorktreeDirectorySetting } from '../opencode/config-files.js';
import { readProjectStartCommand } from '../opencode/project-start-command.js';
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
import { normalizeGitOutputPath } from './output-path.js';
import { overlayEnvironment } from '../environment/variables.js';
import { primaryWorktreeRootFromGitDir, unsupportedRepositoryRootReason } from './repository-root.js';
import { resolveSshAuthSock } from './ssh-auth-sock.js';
import { randomUUID } from 'crypto';
import { worktreeBootstrapFailureMessage } from './worktree-bootstrap-storage.js';
import type { SimpleGit, BranchSummary, FileStatusResult, RemoteWithRefs } from 'simple-git';
import type { ChildProcess } from 'node:child_process';
import type { Readable } from 'node:stream';
import type {
  GitEnvironment, GitUnsafeOptions, GitFactoryOptions, GitOptions, GitCommandOptions, GitCommandResult,
  WorktreeEntry, WorktreeBootstrapState, BootstrapStore, BootstrapOptions,
  WorktreeCreateInput, WorktreeServerOptions, WorktreeCandidate, WorktreeProjectContext,
  WorktreeCreateResult, UpstreamConfiguration, WorktreeBootstrapTask, WorktreeRemovalInput,
  WorktreeArchiveInput, IntegratePlanInput, IntegrateStateInput, DiffOptions, CommitDiffOptions, RangeOptions,
  RepositoryGitContext, GitFileContext, DiffStats, WorktreeTopologyEntry, WorktreeTopologyEvent,
  StartCommandResult, StartCommandOptions, BranchStart, SnapshotOptions, LogOptions,
  HunkAction, PathDiffResult, CommitFile, PostCheckoutHookAction, RepositoryGitPaths, ErrorFields,
} from './service-contracts.js';
export type { RepositoryGitPaths } from './service-contracts.js';

const fsp = fs.promises;
const _require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
let resolvedGitBinary: string | null = null;
const worktreeBootstrapState = new Map<string, WorktreeBootstrapState>();
const activeWorktreeBootstrapTasks = new Map<string, Set<Promise<unknown>>>();
const worktreeSetupCancellations = new Map<string, AbortController>();
const remoteExistenceCache = new Map<string, { exists: boolean; checkedAt: number }>();
const SIMPLE_GIT_SAFE_BINARY_PATTERN = /^([a-z]:)?([a-z0-9/.\\_~-]+)$/i;
const SIMPLE_GIT_UNSAFE_BINARY_WARNING = 'Invalid value supplied for custom binary, restricted characters must be removed';
const REMOTE_EXISTENCE_CACHE_TTL_MS = 30_000;
const gitIndexMutationQueues = new Map<string, Promise<unknown>>();
const remoteProvisioningQueues = new Map<string, Promise<unknown>>();

const WORKTREE_BOOTSTRAP_PENDING = 'pending';
const WORKTREE_BOOTSTRAP_READY = 'ready';
const WORKTREE_BOOTSTRAP_FAILED = 'failed';
const WORKTREE_BOOTSTRAP_PHASE_DIRECTORY_CREATED = 'directory-created';
const WORKTREE_BOOTSTRAP_PHASE_GIT_READY = 'git-ready';
const WORKTREE_BOOTSTRAP_PHASE_SETUP_READY = 'setup-ready';
const WORKTREE_BOOTSTRAP_RECOVERY_ERROR = 'Worktree bootstrap completion is unknown. Inspect the checkout and repair setup before use.';
const GIT_NULL_REF = '0'.repeat(40);
const WORKTREE_INDEX_LOCK_RETRY_DELAY_MS = 250;
const WORKTREE_INDEX_LOCK_STALE_DELAY_MS = 750;
const WORKTREE_COMMAND_OUTPUT_MAX_CHARS = 20 * 1024 * 1024;

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const toBootstrapStateKey = (directory) => {
 const normalized = normalizeDirectoryPath(directory);
 if (!normalized) {
  return '';
 }
 return path.resolve(normalized);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const toBootstrapStateKey = (directory) => {
  const normalized = normalizeDirectoryPath(directory);
  if (!normalized) {
    return '';
  }
  return path.resolve(normalized);
=======
const toBootstrapStateKey = (directory: string) => {
  const normalized = normalizeDirectoryPath(directory);
  if (!normalized) {
    return '';
  }
  return path.resolve(normalized);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const toCanonicalBootstrapStateKey = async (directory) => {
 const key = toBootstrapStateKey(directory);
 if (!key) {
  return '';
 }
 const realPath = await fsp.realpath(key).catch(() => key);
 const normalized = path.normalize(realPath);
 return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const toCanonicalBootstrapStateKey = async (directory) => {
  const key = toBootstrapStateKey(directory);
  if (!key) {
    return '';
  }
  const realPath = await fsp.realpath(key).catch(() => key);
  const normalized = path.normalize(realPath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
=======
const toCanonicalBootstrapStateKey = async (directory: string) => {
  const key = toBootstrapStateKey(directory);
  if (!key) {
    return '';
  }
  const realPath = await fsp.realpath(key).catch(() => key);
  const normalized = path.normalize(realPath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const createWorktreeBootstrapState = (status, phase, error = null, hydration, errorCode) => {
 const safeError = typeof error === 'string'
  ? error.trim().replace(/[\0\r\n]+/g, ' ').replace(/\s+/g, ' ').slice(0, 4096)
  : '';
 const state = {
  status,
  phase,
  error: safeError || null,
  updatedAt: Date.now(),
 };
 if (hydration) state.hydration = hydration;
 if (errorCode) state.errorCode = errorCode;
 return state;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const createWorktreeBootstrapState = (status, phase, error = null, hydration, errorCode) => {
  const safeError = typeof error === 'string'
    ? error.trim().replace(/[\0\r\n]+/g, ' ').replace(/\s+/g, ' ').slice(0, 4096)
    : '';
  const state = {
    status,
    phase,
    error: safeError || null,
    updatedAt: Date.now(),
  };
  if (hydration) state.hydration = hydration;
  if (errorCode) state.errorCode = errorCode;
  return state;
=======
const createWorktreeBootstrapState = <ErrorValue, Hydration, ErrorCode>(status: string, phase: string, error: ErrorValue | null = null, hydration?: Hydration, errorCode?: ErrorCode) => {
  const safeError = isPrimitiveString(error)
    ? error.trim().replace(/[\0\r\n]+/g, ' ').replace(/\s+/g, ' ').slice(0, 4096)
    : '';
  const state: WorktreeBootstrapState = {
    status,
    phase,
    error: safeError || null,
    updatedAt: Date.now(),
  };
  if (hydration) state.hydration = hydration;
  if (errorCode) state.errorCode = errorCode;
  return state;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const setWorktreeBootstrapState = async (directory, status, phase, error = null, hydration, errorCode, bootstrapStore) => {
 const key = await toCanonicalBootstrapStateKey(directory);
 if (!key) {
  return null;
 }
 let state = createWorktreeBootstrapState(status, phase, error, hydration, errorCode);
 worktreeBootstrapState.set(key, state);
 if (bootstrapStore) {
  try {
   state = await bootstrapStore.write(key, state);
   worktreeBootstrapState.set(key, state);
  } catch (cause) {
   const blocker = createWorktreeBootstrapState(
    WORKTREE_BOOTSTRAP_FAILED,
    phase === WORKTREE_BOOTSTRAP_PHASE_SETUP_READY ? WORKTREE_BOOTSTRAP_PHASE_GIT_READY : phase,
    WORKTREE_BOOTSTRAP_RECOVERY_ERROR,
    undefined,
    'UNKNOWN',
   );
   worktreeBootstrapState.set(key, blocker);
   throw Object.assign(new Error(WORKTREE_BOOTSTRAP_RECOVERY_ERROR, { cause }), {
    code: 'WORKTREE_BOOTSTRAP_PERSISTENCE_FAILED',
    bootstrapStatus: blocker,
   });
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const setWorktreeBootstrapState = async (directory, status, phase, error = null, hydration, errorCode, bootstrapStore) => {
  const key = await toCanonicalBootstrapStateKey(directory);
  if (!key) {
    return null;
=======
const setWorktreeBootstrapState = async <ErrorValue, Hydration, ErrorCode>(directory: string, status: string, phase: string, error: ErrorValue | null = null, hydration?: Hydration, errorCode?: ErrorCode, bootstrapStore?: BootstrapStore) => {
  const key = await toCanonicalBootstrapStateKey(directory);
  if (!key) {
    return null;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 }
 return state;
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const clearWorktreeBootstrapState = async (directory, bootstrapStore) => {
 const key = await toCanonicalBootstrapStateKey(directory);
 if (!key) {
  return;
 }
 if (bootstrapStore) await bootstrapStore.remove(key);
 worktreeBootstrapState.delete(key);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const clearWorktreeBootstrapState = async (directory, bootstrapStore) => {
  const key = await toCanonicalBootstrapStateKey(directory);
  if (!key) {
    return;
  }
  if (bootstrapStore) await bootstrapStore.remove(key);
  worktreeBootstrapState.delete(key);
=======
const clearWorktreeBootstrapState = async (directory: string, bootstrapStore?: BootstrapStore) => {
  const key = await toCanonicalBootstrapStateKey(directory);
  if (!key) {
    return;
  }
  if (bootstrapStore) await bootstrapStore.remove(key);
  worktreeBootstrapState.delete(key);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const trackWorktreeBootstrapTask = (directory, task) => {
 const key = toBootstrapStateKey(directory);
 if (!key) {
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const trackWorktreeBootstrapTask = (directory, task) => {
  const key = toBootstrapStateKey(directory);
  if (!key) {
    return task;
  }

  let tasks = activeWorktreeBootstrapTasks.get(key);
  if (!tasks) {
    tasks = new Set();
    activeWorktreeBootstrapTasks.set(key, tasks);
  }
  tasks.add(task);
  const clearTask = () => {
    tasks.delete(task);
    if (tasks.size === 0 && activeWorktreeBootstrapTasks.get(key) === tasks) {
      activeWorktreeBootstrapTasks.delete(key);
    }
  };
  void task.then(clearTask, clearTask);
=======
const rolledBackAttemptFailures = new WeakSet<WorktreeBootstrapState>();
const isRolledBackAttemptFailure = (state: WorktreeBootstrapState | undefined) => state !== undefined && rolledBackAttemptFailures.has(state);

const isReclaimableFailure = (state: WorktreeBootstrapState | undefined) => state?.status === WORKTREE_BOOTSTRAP_FAILED
  && !isRolledBackAttemptFailure(state);

const isMissingPathError = <Failure>(error: Failure) => errorField(error, 'code') === 'ENOENT' || errorField(error, 'code') === 'ENOTDIR';

const forgetMissingWorktreeFailure = async (key: string, bootstrapStore?: BootstrapStore) => {
  const current = worktreeBootstrapState.get(key);
  if (isRolledBackAttemptFailure(current)) return false;
  if (bootstrapStore) {
    if (!await bootstrapStore.remove(key, { ifMissingFailed: true })) return false;
  } else {
    if (current?.status !== WORKTREE_BOOTSTRAP_FAILED) return false;
    try {
      await fsp.lstat(key);
      return false;
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }
  }
  if (worktreeBootstrapState.get(key) === current) worktreeBootstrapState.delete(key);
  return true;
};

const directoryIsGone = async (key: string) => {
  try {
    await fsp.lstat(key);
    return false;
  } catch (error) {
    return isMissingPathError(error);
  }
};

const releaseRolledBackAttemptFailure = async (key: string, bootstrapStore?: BootstrapStore) => {
  const current = worktreeBootstrapState.get(key);
  if (current?.status !== WORKTREE_BOOTSTRAP_FAILED) return;
  rolledBackAttemptFailures.add(current);
  if (bootstrapStore) await bootstrapStore.remove(key, { ifMissingFailed: true });
};

const trackWorktreeBootstrapTask = <Result>(directory: string, task: Promise<Result>) => {
  const key = toBootstrapStateKey(directory);
  if (!key) {
    return task;
  }

  let tasks = activeWorktreeBootstrapTasks.get(key);
  if (!tasks) {
    tasks = new Set();
    activeWorktreeBootstrapTasks.set(key, tasks);
  }
  tasks.add(task);
  const clearTask = () => {
    tasks.delete(task);
    if (tasks.size === 0 && activeWorktreeBootstrapTasks.get(key) === tasks) {
      activeWorktreeBootstrapTasks.delete(key);
    }
  };
  void task.then(clearTask, clearTask);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  return task;
 }

 let tasks = activeWorktreeBootstrapTasks.get(key);
 if (!tasks) {
  tasks = new Set();
  activeWorktreeBootstrapTasks.set(key, tasks);
 }
 tasks.add(task);
 const clearTask = () => {
  tasks.delete(task);
  if (tasks.size === 0 && activeWorktreeBootstrapTasks.get(key) === tasks) {
   activeWorktreeBootstrapTasks.delete(key);
  }
 };
 void task.then(clearTask, clearTask);
 return task;
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export const waitForActiveWorktreeBootstrap = async (directory) => {
 const key = toBootstrapStateKey(directory);
 if (!key) {
  return;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export const waitForActiveWorktreeBootstrap = async (directory) => {
  const key = toBootstrapStateKey(directory);
  if (!key) {
    return;
  }
=======
export const waitForActiveWorktreeBootstrap = async (directory: string) => {
  const key = toBootstrapStateKey(directory);
  if (!key) {
    return;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 while (true) {
  let tasks = activeWorktreeBootstrapTasks.get(key);
  if (!tasks) {
   const canonicalKey = await canonicalPath(key);
   for (const [trackedKey, trackedTasks] of activeWorktreeBootstrapTasks) {
    if (await canonicalPath(trackedKey) === canonicalKey) {
     tasks = trackedTasks;
     break;
    }
   }
  }
  if (!tasks) {
   return;
  }
  await Promise.allSettled([...tasks]);
 }
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Stops the setup commands of a bootstrap in progress, and any not started yet.
// The bootstrap then settles by itself, whatever it had left to do.
const cancelWorktreeSetup = async (directory) => {
 const canonicalKey = await canonicalPath(toBootstrapStateKey(directory));
 for (const [trackedKey, cancellation] of worktreeSetupCancellations) {
  if (await canonicalPath(trackedKey) === canonicalKey) cancellation.abort();
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Stops the setup commands of a bootstrap in progress, and any not started yet.
// The bootstrap then settles by itself, whatever it had left to do.
const cancelWorktreeSetup = async (directory) => {
  const canonicalKey = await canonicalPath(toBootstrapStateKey(directory));
  for (const [trackedKey, cancellation] of worktreeSetupCancellations) {
    if (await canonicalPath(trackedKey) === canonicalKey) cancellation.abort();
  }
=======
const cancelWorktreeSetup = async (directory: string) => {
  const canonicalKey = await canonicalPath(toBootstrapStateKey(directory));
  for (const [trackedKey, cancellation] of worktreeSetupCancellations) {
    if (await canonicalPath(trackedKey) === canonicalKey) cancellation.abort();
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const hasActiveWorktreeBootstrap = async (directory) => {
 const key = toBootstrapStateKey(directory);
 if (!key) {
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const hasActiveWorktreeBootstrap = async (directory) => {
  const key = toBootstrapStateKey(directory);
  if (!key) {
    return false;
  }
  if (activeWorktreeBootstrapTasks.has(key)) {
    return true;
  }
  const canonicalKey = await toCanonicalBootstrapStateKey(key);
  for (const trackedKey of activeWorktreeBootstrapTasks.keys()) {
    if (await toCanonicalBootstrapStateKey(trackedKey) === canonicalKey) {
      return true;
    }
  }
=======
const hasActiveWorktreeBootstrap = async (directory: string) => {
  const key = toBootstrapStateKey(directory);
  if (!key) {
    return false;
  }
  if (activeWorktreeBootstrapTasks.has(key)) {
    return true;
  }
  const canonicalKey = await toCanonicalBootstrapStateKey(key);
  for (const trackedKey of activeWorktreeBootstrapTasks.keys()) {
    if (await toCanonicalBootstrapStateKey(trackedKey) === canonicalKey) {
      return true;
    }
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  return false;
 }
 if (activeWorktreeBootstrapTasks.has(key)) {
  return true;
 }
 const canonicalKey = await toCanonicalBootstrapStateKey(key);
 for (const trackedKey of activeWorktreeBootstrapTasks.keys()) {
  if (await toCanonicalBootstrapStateKey(trackedKey) === canonicalKey) {
   return true;
  }
 }
 return false;
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const isExecutableFile = (candidate) => {
 if (typeof candidate !== 'string' || candidate.trim().length === 0) {
  return false;
 }
 try {
  const stat = fs.statSync(candidate);
  if (!stat.isFile()) {
   return false;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const isExecutableFile = (candidate) => {
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    return false;
=======
const isExecutableFile = (candidate: string | null): candidate is string => {
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    return false;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  if (process.platform === 'win32') {
   const ext = path.extname(candidate).toLowerCase();
   return ext.length === 0 || ext === '.exe' || ext === '.cmd' || ext === '.bat' || ext === '.com';
  }
  fs.accessSync(candidate, fs.constants.X_OK);
  return true;
 } catch {
  return false;
 }
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const normalizeGitExecutableCandidate = (candidate) => {
 if (typeof candidate !== 'string') {
  return null;
 }
 const trimmed = candidate.trim();
 if (!trimmed) {
  return null;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const normalizeGitExecutableCandidate = (candidate) => {
  if (typeof candidate !== 'string') {
    return null;
  }
  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }
=======
const normalizeGitExecutableCandidate = (candidate: string) => {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const ext = path.extname(trimmed).toLowerCase();
 if (ext === '.cmd' || ext === '.bat' || ext === '.com') {
  const exeCandidate = trimmed.slice(0, -ext.length) + '.exe';
  if (isExecutableFile(exeCandidate)) {
   return exeCandidate;
  }
 }

 return trimmed;
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const isSafeSimpleGitBinary = (candidate) => (
 typeof candidate === 'string' && SIMPLE_GIT_SAFE_BINARY_PATTERN.test(candidate)
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const isSafeSimpleGitBinary = (candidate) => (
  typeof candidate === 'string' && SIMPLE_GIT_SAFE_BINARY_PATTERN.test(candidate)
=======
const isSafeSimpleGitBinary = (candidate: string) => (
  SIMPLE_GIT_SAFE_BINARY_PATTERN.test(candidate)
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
);

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const createSimpleGit = (options) => {
 if (!options?.unsafe?.allowUnsafeCustomBinary) {
  return simpleGit(options);
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const createSimpleGit = (options) => {
  if (!options?.unsafe?.allowUnsafeCustomBinary) {
    return simpleGit(options);
  }
=======
const createSimpleGit = (options: GitFactoryOptions) => {
  if (!options?.unsafe?.allowUnsafeCustomBinary) {
    return simpleGit(options);
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const originalWarn = console.warn;
 console.warn = (...args) => {
  if (String(args[0] || '').includes(SIMPLE_GIT_UNSAFE_BINARY_WARNING)) {
   return;
  }
  originalWarn(...args);
 };

 try {
  return simpleGit(options);
 } finally {
  console.warn = originalWarn;
 }
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const listPathExecutableCandidates = (binaryName) => {
 const currentPath = process.env.PATH || '';
 const seen = new Set();
 const matches = [];
 for (const segment of currentPath.split(path.delimiter)) {
  const dir = typeof segment === 'string' ? segment.trim() : '';
  if (!dir || seen.has(dir)) {
   continue;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const listPathExecutableCandidates = (binaryName) => {
  const currentPath = process.env.PATH || '';
  const seen = new Set();
  const matches = [];
  for (const segment of currentPath.split(path.delimiter)) {
    const dir = typeof segment === 'string' ? segment.trim() : '';
    if (!dir || seen.has(dir)) {
      continue;
    }
    seen.add(dir);
    matches.push(path.join(dir, binaryName));
=======
const listPathExecutableCandidates = (binaryName: string) => {
  const currentPath = process.env.PATH || '';
  const seen = new Set<string>();
  const matches = [];
  for (const segment of currentPath.split(path.delimiter)) {
    const dir = segment.trim();
    if (!dir || seen.has(dir)) {
      continue;
    }
    seen.add(dir);
    matches.push(path.join(dir, binaryName));
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  seen.add(dir);
  matches.push(path.join(dir, binaryName));
 }
 return matches;
};

const listWindowsGitInstallCandidates = () => {
<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const roots = [
  process.env.ProgramFiles,
  process.env['ProgramFiles(x86)'],
  process.env.LocalAppData,
 ]
  .map((value) => (typeof value === 'string' ? value.trim() : ''))
  .filter(Boolean);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const roots = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LocalAppData,
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
=======
  const roots = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LocalAppData,
  ]
    .map((value) => (isPrimitiveString(value) ? value.trim() : ''))
    .filter(Boolean);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const candidates = [];
 for (const root of roots) {
  candidates.push(path.join(root, 'Git', 'cmd', 'git.exe'));
  candidates.push(path.join(root, 'Git', 'bin', 'git.exe'));
  candidates.push(path.join(root, 'Git', 'mingw64', 'bin', 'git.exe'));
  candidates.push(path.join(root, 'Programs', 'Git', 'cmd', 'git.exe'));
  candidates.push(path.join(root, 'Programs', 'Git', 'bin', 'git.exe'));
 }
 return candidates;
};

const resolveExplicitGitBinary = () => {
  const explicit = [process.env.GIT_BINARY, process.env.OPENCHAMBER_GIT_BINARY]
    .map((value) => (isPrimitiveString(value) ? value.trim() : ''))
    .filter(Boolean);
  for (const candidate of explicit) {
    const normalized = normalizeGitExecutableCandidate(candidate);
    if (isExecutableFile(normalized)) {
      return normalized;
    }
  }
  return null;
};

const resolveGitBinary = () => {
<<<<<<< HEAD:packages/web/server/lib/git/service.js
 if (process.platform !== 'win32') {
  return 'git';
 }
 if (resolvedGitBinary) {
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  if (process.platform !== 'win32') {
    return 'git';
  }
  if (resolvedGitBinary) {
    return resolvedGitBinary;
  }

  const explicit = [process.env.GIT_BINARY, process.env.OPENCHAMBER_GIT_BINARY]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  for (const candidate of explicit) {
    const normalized = normalizeGitExecutableCandidate(candidate);
    if (isExecutableFile(normalized)) {
      resolvedGitBinary = normalized;
      return resolvedGitBinary;
    }
  }

  const pathDiscovered = [
    ...listPathExecutableCandidates('git.exe'),
    ...listPathExecutableCandidates('git'),
  ]
    .map(normalizeGitExecutableCandidate)
    .filter(Boolean)
    .filter((candidate) => isExecutableFile(candidate));
  if (pathDiscovered.length > 0) {
    resolvedGitBinary = 'git';
    return resolvedGitBinary;
  }

  const discovered = [
    ...listWindowsGitInstallCandidates(),
  ]
    .map(normalizeGitExecutableCandidate)
    .filter(Boolean)
    .filter((candidate) => isExecutableFile(candidate));

  const preferredExe = discovered.find((candidate) => isSafeSimpleGitBinary(candidate) && candidate.toLowerCase().endsWith('.exe'))
    || discovered.find((candidate) => candidate.toLowerCase().endsWith('.exe'));
  resolvedGitBinary = preferredExe || discovered[0] || 'git.exe';
=======
  if (process.platform !== 'win32') {
    return resolveExplicitGitBinary() || 'git';
  }
  if (resolvedGitBinary) {
    return resolvedGitBinary;
  }

  const explicit = resolveExplicitGitBinary();
  if (explicit) {
    resolvedGitBinary = explicit;
    return resolvedGitBinary;
  }

  const pathDiscovered = [
    ...listPathExecutableCandidates('git.exe'),
    ...listPathExecutableCandidates('git'),
  ]
    .map(normalizeGitExecutableCandidate)
    .filter(Boolean)
    .filter((candidate) => isExecutableFile(candidate));
  if (pathDiscovered.length > 0) {
    resolvedGitBinary = 'git';
    return resolvedGitBinary;
  }

  const discovered = [
    ...listWindowsGitInstallCandidates(),
  ]
    .map(normalizeGitExecutableCandidate)
    .filter(Boolean)
    .filter((candidate) => isExecutableFile(candidate));

  const preferredExe = discovered.find((candidate) => isSafeSimpleGitBinary(candidate) && candidate.toLowerCase().endsWith('.exe'))
    || discovered.find((candidate) => candidate.toLowerCase().endsWith('.exe'));
  resolvedGitBinary = preferredExe || discovered[0] || 'git.exe';
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  return resolvedGitBinary;
 }

 const explicit = [process.env.GIT_BINARY, process.env.OPENCHAMBER_GIT_BINARY]
  .map((value) => (typeof value === 'string' ? value.trim() : ''))
  .filter(Boolean);
 for (const candidate of explicit) {
  const normalized = normalizeGitExecutableCandidate(candidate);
  if (isExecutableFile(normalized)) {
   resolvedGitBinary = normalized;
   return resolvedGitBinary;
  }
 }

 const pathDiscovered = [
  ...listPathExecutableCandidates('git.exe'),
  ...listPathExecutableCandidates('git'),
 ]
  .map(normalizeGitExecutableCandidate)
  .filter(Boolean)
  .filter((candidate) => isExecutableFile(candidate));
 if (pathDiscovered.length > 0) {
  resolvedGitBinary = 'git';
  return resolvedGitBinary;
 }

 const discovered = [
  ...listWindowsGitInstallCandidates(),
 ]
  .map(normalizeGitExecutableCandidate)
  .filter(Boolean)
  .filter((candidate) => isExecutableFile(candidate));

 const preferredExe = discovered.find((candidate) => isSafeSimpleGitBinary(candidate) && candidate.toLowerCase().endsWith('.exe'))
  || discovered.find((candidate) => candidate.toLowerCase().endsWith('.exe'));
 resolvedGitBinary = preferredExe || discovered[0] || 'git.exe';
 return resolvedGitBinary;
};

const getGitBinary = () => resolveGitBinary();

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const isSocketPath = async (candidate) => {
 if (!candidate || typeof candidate !== 'string') {
  return false;
 }
 try {
  const stat = await fsp.stat(candidate);
  return typeof stat.isSocket === 'function' && stat.isSocket();
 } catch {
  return false;
 }
};
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const isSocketPath = async (candidate) => {
  if (!candidate || typeof candidate !== 'string') {
    return false;
  }
  try {
    const stat = await fsp.stat(candidate);
    return typeof stat.isSocket === 'function' && stat.isSocket();
  } catch {
    return false;
  }
};
=======
let gitEnvironment: GitEnvironment | null = null;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const resolveSshAuthSock = async () => {
 const existing = (process.env.SSH_AUTH_SOCK || '').trim();
 if (existing) {
  return existing;
 }

 if (process.platform === 'win32') {
  return null;
 }

 const gpgSock = path.join(os.homedir(), '.gnupg', 'S.gpg-agent.ssh');
 if (await isSocketPath(gpgSock)) {
  return gpgSock;
 }

 const runGpgconf = async (args) => {
  for (const candidate of gpgconfCandidates) {
   try {
    const { stdout } = await execFileAsync(candidate, args);
    return String(stdout || '');
   } catch {
    continue;
   }
  }
  return '';
 };

 const candidate = (await runGpgconf(['--list-dirs', 'agent-ssh-socket'])).trim();
 if (candidate && await isSocketPath(candidate)) {
  return candidate;
 }

 if (candidate) {
  await runGpgconf(['--launch', 'gpg-agent']);
  const retried = (await runGpgconf(['--list-dirs', 'agent-ssh-socket'])).trim();
  if (retried && await isSocketPath(retried)) {
   return retried;
  }
 }

 return null;
};

// Variables the user gave OpenChamber for the directory's project
// (lib/environment). Unset in tests and tools that use this module alone.
let gitEnvironment = null;

export const configureGitEnvironment = (runtime) => {
 gitEnvironment = runtime;
};

// Host composition injects the canonical project-config reader. It answers the
// personal `worktreeDirectory` value for a project config id, or null. Unset in
// tests and tools that load this module alone, where no personal override
// applies.
let projectWorktreeDirectoryReader = null;

export const configureProjectWorktreeDirectory = (reader) => {
 projectWorktreeDirectoryReader = typeof reader === 'function' ? reader : null;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const resolveSshAuthSock = async () => {
  const existing = (process.env.SSH_AUTH_SOCK || '').trim();
  if (existing) {
    return existing;
  }

  if (process.platform === 'win32') {
    return null;
  }

  const gpgSock = path.join(os.homedir(), '.gnupg', 'S.gpg-agent.ssh');
  if (await isSocketPath(gpgSock)) {
    return gpgSock;
  }

  const runGpgconf = async (args) => {
    for (const candidate of gpgconfCandidates) {
      try {
        const { stdout } = await execFileAsync(candidate, args);
        return String(stdout || '');
      } catch {
        continue;
      }
    }
    return '';
  };

  const candidate = (await runGpgconf(['--list-dirs', 'agent-ssh-socket'])).trim();
  if (candidate && await isSocketPath(candidate)) {
    return candidate;
  }

  if (candidate) {
    await runGpgconf(['--launch', 'gpg-agent']);
    const retried = (await runGpgconf(['--list-dirs', 'agent-ssh-socket'])).trim();
    if (retried && await isSocketPath(retried)) {
      return retried;
    }
  }

  return null;
};

// Variables the user gave OpenChamber for the directory's project
// (lib/environment). Unset in tests and tools that use this module alone.
let gitEnvironment = null;

export const configureGitEnvironment = (runtime) => {
  gitEnvironment = runtime;
=======
export const configureGitEnvironment = (runtime: GitEnvironment | null) => {
  gitEnvironment = runtime;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Names simple-git refuses in a command's environment, each with the unsafe
// category that lets it through (a copy of @simple-git/argv-parser's table;
// see simpleGitEnvOptions). One of them from a project environment would make
// every Git command fail, so the overlay leaves them out for Git only.
const SIMPLE_GIT_REFUSED_ENV_CATEGORIES = {
 editor: 'allowUnsafeEditor',
 git_askpass: 'allowUnsafeAskPass',
 git_config: 'allowUnsafeConfigPaths',
 git_config_count: 'allowUnsafeConfigEnvCount',
 git_config_global: 'allowUnsafeConfigPaths',
 git_config_parameters: 'allowUnsafeConfigEnvCount',
 git_config_system: 'allowUnsafeConfigPaths',
 git_editor: 'allowUnsafeEditor',
 git_exec_path: 'allowUnsafeExec',
 git_external_diff: 'allowUnsafeDiffExternal',
 git_pager: 'allowUnsafePager',
 git_proxy_command: 'allowUnsafeGitProxy',
 git_sequence_editor: 'allowUnsafeEditor',
 git_ssh: 'allowUnsafeSshCommand',
 git_ssh_command: 'allowUnsafeSshCommand',
 git_template_dir: 'allowUnsafeTemplateDir',
 pager: 'allowUnsafePager',
 prefix: 'allowUnsafeConfigPaths',
 ssh_askpass: 'allowUnsafeAskPass',
 visual: 'allowUnsafeEditor',
};
const isRefusedBySimpleGit = (name) => {
 const lower = name.toLowerCase();
 return Object.hasOwn(SIMPLE_GIT_REFUSED_ENV_CATEGORIES, lower) || lower.startsWith('git_config_key_') || lower.startsWith('git_config_value_');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Names simple-git refuses in a command's environment, each with the unsafe
// category that lets it through (a copy of @simple-git/argv-parser's table;
// see simpleGitEnvOptions). One of them from a project environment would make
// every Git command fail, so the overlay leaves them out for Git only.
const SIMPLE_GIT_REFUSED_ENV_CATEGORIES = new Map([
  ['editor', 'allowUnsafeEditor'],
  ['git_askpass', 'allowUnsafeAskPass'],
  ['git_config', 'allowUnsafeConfigPaths'],
  ['git_config_count', 'allowUnsafeConfigEnvCount'],
  ['git_config_global', 'allowUnsafeConfigPaths'],
  ['git_config_parameters', 'allowUnsafeConfigEnvCount'],
  ['git_config_system', 'allowUnsafeConfigPaths'],
  ['git_editor', 'allowUnsafeEditor'],
  ['git_exec_path', 'allowUnsafeExec'],
  ['git_external_diff', 'allowUnsafeDiffExternal'],
  ['git_pager', 'allowUnsafePager'],
  ['git_proxy_command', 'allowUnsafeGitProxy'],
  ['git_sequence_editor', 'allowUnsafeEditor'],
  ['git_ssh', 'allowUnsafeSshCommand'],
  ['git_ssh_command', 'allowUnsafeSshCommand'],
  ['git_template_dir', 'allowUnsafeTemplateDir'],
  ['pager', 'allowUnsafePager'],
  ['prefix', 'allowUnsafeConfigPaths'],
  ['ssh_askpass', 'allowUnsafeAskPass'],
  ['visual', 'allowUnsafeEditor'],
]);
const isRefusedBySimpleGit = (name) => {
  const lower = name.toLowerCase();
  return SIMPLE_GIT_REFUSED_ENV_CATEGORIES.has(lower) || lower.startsWith('git_config_key_') || lower.startsWith('git_config_value_');
=======
const SIMPLE_GIT_REFUSED_ENV_CATEGORIES = new Map<string, keyof GitUnsafeOptions>([
  ['editor', 'allowUnsafeEditor'],
  ['git_askpass', 'allowUnsafeAskPass'],
  ['git_config', 'allowUnsafeConfigPaths'],
  ['git_config_count', 'allowUnsafeConfigEnvCount'],
  ['git_config_global', 'allowUnsafeConfigPaths'],
  ['git_config_parameters', 'allowUnsafeConfigEnvCount'],
  ['git_config_system', 'allowUnsafeConfigPaths'],
  ['git_editor', 'allowUnsafeEditor'],
  ['git_exec_path', 'allowUnsafeExec'],
  ['git_external_diff', 'allowUnsafeDiffExternal'],
  ['git_pager', 'allowUnsafePager'],
  ['git_proxy_command', 'allowUnsafeGitProxy'],
  ['git_sequence_editor', 'allowUnsafeEditor'],
  ['git_ssh', 'allowUnsafeSshCommand'],
  ['git_ssh_command', 'allowUnsafeSshCommand'],
  ['git_template_dir', 'allowUnsafeTemplateDir'],
  ['pager', 'allowUnsafePager'],
  ['prefix', 'allowUnsafeConfigPaths'],
  ['ssh_askpass', 'allowUnsafeAskPass'],
  ['visual', 'allowUnsafeEditor'],
]);
const isRefusedBySimpleGit = (name: string) => {
  const lower = name.toLowerCase();
  return SIMPLE_GIT_REFUSED_ENV_CATEGORIES.has(lower) || lower.startsWith('git_config_key_') || lower.startsWith('git_config_value_');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};
const REPOSITORY_LOCATION_ENV_NAMES = new Set([
 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
 'GIT_COMMON_DIR', 'GIT_NAMESPACE',
]);
const isKeptOutOfGitOverlay = (name: string) => isRefusedBySimpleGit(name) || REPOSITORY_LOCATION_ENV_NAMES.has(name.toUpperCase());

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const directoryEnvironmentForGit = async (directory) => {
 if (!gitEnvironment || !directory) return null;
 const variables = await gitEnvironment.forDirectory(normalizeDirectoryPath(directory));
 if (!variables) return null;
 return Object.fromEntries(Object.entries(variables).filter(([name]) => !isKeptOutOfGitOverlay(name)));
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const directoryEnvironmentForGit = async (directory) => {
  if (!gitEnvironment || !directory) return null;
  const variables = await gitEnvironment.forDirectory(normalizeDirectoryPath(directory));
  if (!variables) return null;
  return Object.fromEntries(Object.entries(variables).filter(([name]) => !isKeptOutOfGitOverlay(name)));
=======
const directoryEnvironmentForGit = async (directory: string) => {
  if (!gitEnvironment || !directory) return null;
  const variables = await gitEnvironment.forDirectory(normalizeDirectoryPath(directory));
  if (!variables) return null;
  return Object.fromEntries(Object.entries(variables).filter(([name]) => !isKeptOutOfGitOverlay(name)));
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const buildGitEnv = async (directory) => {
 // Git runs the user's hooks, so they must not see what the AppImage launcher
 // added to LD_LIBRARY_PATH and friends (#4177).
 const inherited = stripAppImageLauncherEnv({ ...process.env });
 // Hooks and credential helpers run with the project's tools on PATH.
 const variables = await directoryEnvironmentForGit(directory);
 const env = variables ? overlayEnvironment(inherited, variables) : inherited;
 // Git diagnostics and simple-git's conflict parser require stable messages.
 env.LC_ALL = 'C';
 if (process.platform === 'win32') {
  // Node already passes an argument array. MSYS globbing corrupts Git refs
  // such as HEAD^{commit} and branch@{upstream} before Git sees them.
  env.MSYS = [env.MSYS, 'noglob'].filter(Boolean).join(' ');
 }
 if (!env.SSH_AUTH_SOCK || !env.SSH_AUTH_SOCK.trim()) {
  const resolved = await resolveSshAuthSock();
  if (resolved) {
   env.SSH_AUTH_SOCK = resolved;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const buildGitEnv = async (directory) => {
  // Git runs the user's hooks, so they must not see what the AppImage launcher
  // added to LD_LIBRARY_PATH and friends (#4177).
  const inherited = stripAppImageLauncherEnv({ ...process.env });
  // Hooks and credential helpers run with the project's tools on PATH.
  const variables = await directoryEnvironmentForGit(directory);
  const env = variables ? overlayEnvironment(inherited, variables) : inherited;
  if (process.platform === 'win32') {
    // Node already passes an argument array. MSYS globbing corrupts Git refs
    // such as HEAD^{commit} and branch@{upstream} before Git sees them.
    env.MSYS = [env.MSYS, 'noglob'].filter(Boolean).join(' ');
=======
const buildGitEnv = async (directory: string) => {
  const inherited = stripAppImageLauncherEnv({ ...process.env });
  const variables = await directoryEnvironmentForGit(directory);
  const env = variables ? overlayEnvironment(inherited, variables) : inherited;
  if (process.platform === 'win32') {
    env.MSYS = [env.MSYS, 'noglob'].filter(Boolean).join(' ');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
 }
 // The server has no terminal a user could answer. Without this, Git asks
 // for a username or password on its (hidden, on Windows) console and waits
 // forever; credential helpers and GUI prompts still run before this point.
 if (env.GIT_TERMINAL_PROMPT === undefined || variables?.GIT_TERMINAL_PROMPT !== undefined) {
  env.GIT_TERMINAL_PROMPT = '0';
 }
 return env;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  if (!env.SSH_AUTH_SOCK || !env.SSH_AUTH_SOCK.trim()) {
    const resolved = await resolveSshAuthSock();
    if (resolved) {
      env.SSH_AUTH_SOCK = resolved;
    }
  }
  // The server has no terminal a user could answer. Without this, Git asks
  // for a username or password on its (hidden, on Windows) console and waits
  // forever; credential helpers and GUI prompts still run before this point.
  if (env.GIT_TERMINAL_PROMPT === undefined || variables?.GIT_TERMINAL_PROMPT !== undefined) {
    env.GIT_TERMINAL_PROMPT = '0';
  }
  return env;
=======
  if (!env.SSH_AUTH_SOCK || !env.SSH_AUTH_SOCK.trim()) {
    const resolved = await resolveSshAuthSock();
    if (resolved) {
      env.SSH_AUTH_SOCK = resolved;
    }
  }
  if (env.GIT_TERMINAL_PROMPT === undefined || variables?.GIT_TERMINAL_PROMPT !== undefined) {
    env.GIT_TERMINAL_PROMPT = '0';
  }
  return env;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// simple-git 4 hands git only the variables of an explicit env that it allows:
// every GIT_* name and every name that runs a program needs allowEnvironment,
// and a program-running name (EDITOR, PAGER, GIT_SSH_COMMAND, GIT_ASKPASS, ...)
// also needs its unsafe category, which guards -c and other arguments too.
// buildGitEnv already decided what git sees, so every name it holds is
// allowed. A program-running variable the server's own environment passes
// through unchanged is what git would inherit without an env anyway, so its
// category is enabled; one that OpenChamber set or changed stays refused.
const simpleGitEnvOptions = (env) => {
 const unsafe = {};
 for (const [key, value] of Object.entries(env)) {
  const category = SIMPLE_GIT_REFUSED_ENV_CATEGORIES[key.toLowerCase()];
  if (category && process.env[key] === value) {
   unsafe[category] = true;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// simple-git 4 hands git only the variables of an explicit env that it allows:
// every GIT_* name and every name that runs a program needs allowEnvironment,
// and a program-running name (EDITOR, PAGER, GIT_SSH_COMMAND, GIT_ASKPASS, ...)
// also needs its unsafe category, which guards -c and other arguments too.
// buildGitEnv already decided what git sees, so every name it holds is
// allowed. A program-running variable the server's own environment passes
// through unchanged is what git would inherit without an env anyway, so its
// category is enabled; one that OpenChamber set or changed stays refused.
const simpleGitEnvOptions = (env) => {
  const unsafe = {};
  for (const [key, value] of Object.entries(env)) {
    const category = SIMPLE_GIT_REFUSED_ENV_CATEGORIES.get(key.toLowerCase());
    if (category && process.env[key] === value) {
      unsafe[category] = true;
    }
=======
const simpleGitEnvOptions = (env: NodeJS.ProcessEnv) => {
  const unsafe: GitUnsafeOptions = {};
  for (const [key, value] of Object.entries(env)) {
    const category = SIMPLE_GIT_REFUSED_ENV_CATEGORIES.get(key.toLowerCase());
    if (category && process.env[key] === value) {
      unsafe[category] = true;
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 }
 return { allowEnvironment: Object.keys(env), unsafe };
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Transport configuration is owned by repository bindings and the credential
// broker, so no caller asks for simple-git's unsafe SSH-command or
// credential-helper escapes; simpleGitEnvOptions turns a category on only to
// let an inherited variable through.
// `extraEnv` adds variables for this instance only, such as a temporary
// GIT_INDEX_FILE; simple-git refuses a GIT_* name added later through .env().
const createGit = async (directory, { stallTimeoutMs = 0, optionalLocks = true, extraEnv } = {}) => {
 const env = { ...(await buildGitEnv(directory)), ...extraEnv };
 // `git status` holds `.git/index.lock` while it refreshes the index, and a
 // `git commit` the user runs in a terminal at that moment fails with
 // "index.lock: File exists" (#2229). Read-only callers opt out of that
 // refresh; commands that write the index still take the lock.
 if (!optionalLocks) {
  env.GIT_OPTIONAL_LOCKS = '0';
 }
 const spawnOptions = { windowsHide: true };
 // simple-git's block timeout kills the process once it has produced no
 // output for this long. Opt-in per caller: a background read must never hold
 // a limiter slot forever, while a silent long push or fetch must not be cut.
 const timeout = stallTimeoutMs > 0 ? { block: stallTimeoutMs } : undefined;
 const binary = getGitBinary();
 const hasCustomBinary = typeof binary === 'string' && binary.trim() && binary !== 'git' && binary !== 'git.exe';
 const { allowEnvironment, unsafe } = simpleGitEnvOptions(env);
 if (hasCustomBinary) {
  unsafe.allowUnsafeCustomBinary = true;
 }
 // Always pin simple-git to an explicit working directory. Omitting baseDir
 // makes simple-git use process.cwd(), which breaks when the OpenChamber
 // server was launched from a neutral directory (e.g. $HOME) and the opened
 // project lives elsewhere — session/project discovery then sees spurious
 // "not a git repository" errors and can abort enumeration.
 const baseDir = normalizeDirectoryPath(directory);
 if (typeof baseDir !== 'string' || !baseDir.trim()) {
  throw new Error('Git directory is required');
 }
 // simple-git ignores an `env` constructor option; only .env() reaches git.
 return createSimpleGit({
  baseDir,
  spawnOptions,
  binary,
  unsafe,
  allowEnvironment,
  ...(timeout ? { timeout } : {}),
 }).env(env);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Transport configuration is owned by repository bindings and the credential
// broker, so no caller asks for simple-git's unsafe SSH-command or
// credential-helper escapes; simpleGitEnvOptions turns a category on only to
// let an inherited variable through.
// `extraEnv` adds variables for this instance only, such as a temporary
// GIT_INDEX_FILE; simple-git refuses a GIT_* name added later through .env().
const createGit = async (directory, { stallTimeoutMs = 0, optionalLocks = true, extraEnv } = {}) => {
  const env = { ...(await buildGitEnv(directory)), ...extraEnv };
  // `git status` holds `.git/index.lock` while it refreshes the index, and a
  // `git commit` the user runs in a terminal at that moment fails with
  // "index.lock: File exists" (#2229). Read-only callers opt out of that
  // refresh; commands that write the index still take the lock.
  if (!optionalLocks) {
    env.GIT_OPTIONAL_LOCKS = '0';
  }
  const spawnOptions = { windowsHide: true };
  // simple-git's block timeout kills the process once it has produced no
  // output for this long. Opt-in per caller: a background read must never hold
  // a limiter slot forever, while a silent long push or fetch must not be cut.
  const timeout = stallTimeoutMs > 0 ? { block: stallTimeoutMs } : undefined;
  const binary = getGitBinary();
  const hasCustomBinary = typeof binary === 'string' && binary.trim() && binary !== 'git' && binary !== 'git.exe';
  const { allowEnvironment, unsafe } = simpleGitEnvOptions(env);
  if (hasCustomBinary) {
    unsafe.allowUnsafeCustomBinary = true;
  }
  // Always pin simple-git to an explicit working directory. Omitting baseDir
  // makes simple-git use process.cwd(), which breaks when the OpenChamber
  // server was launched from a neutral directory (e.g. $HOME) and the opened
  // project lives elsewhere — session/project discovery then sees spurious
  // "not a git repository" errors and can abort enumeration.
  const baseDir = normalizeDirectoryPath(directory);
  if (typeof baseDir !== 'string' || !baseDir.trim()) {
    throw new Error('Git directory is required');
  }
  // simple-git ignores an `env` constructor option; only .env() reaches git.
  return createSimpleGit({
    baseDir,
    spawnOptions,
    binary,
    unsafe,
    allowEnvironment,
    ...(timeout ? { timeout } : {}),
  }).env(env);
=======
const createGit = async (directory: string, { stallTimeoutMs = 0, optionalLocks = true, extraEnv }: GitOptions = {}) => {
  const env = { ...(await buildGitEnv(directory)), ...extraEnv };
  if (!optionalLocks) {
    env.GIT_OPTIONAL_LOCKS = '0';
  }
  const spawnOptions = { windowsHide: true };
  const timeout = stallTimeoutMs > 0 ? { block: stallTimeoutMs } : undefined;
  const binary = getGitBinary();
  const hasCustomBinary = binary.trim() && binary !== 'git' && binary !== 'git.exe';
  const { allowEnvironment, unsafe } = simpleGitEnvOptions(env);
  if (hasCustomBinary) {
    unsafe.allowUnsafeCustomBinary = true;
  }
  const baseDir = normalizeDirectoryPath(directory);
  if (!isPrimitiveString(baseDir) || !baseDir.trim()) {
    throw new Error('Git directory is required');
  }
  const options: GitFactoryOptions = {
    baseDir,
    spawnOptions,
    binary,
    unsafe,
    allowEnvironment,
  };
  if (timeout) options.timeout = timeout;
  return createSimpleGit(options).env(env);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

const createGitForGlobalConfig = async () => createGit(os.homedir());

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const normalizeDirectoryPath = (value) => {
 if (typeof value !== 'string') {
  return value;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const normalizeDirectoryPath = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed === '~') {
    return os.homedir();
  }

  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
=======
const normalizeDirectoryPath = <Value>(value: Value) => {
  if (!isPrimitiveString(value)) {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed === '~') {
    return os.homedir();
  }

  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const trimmed = value.trim();
 if (!trimmed) {
  return trimmed;
 }

 if (trimmed === '~') {
  return os.homedir();
 }

 if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
  return path.join(os.homedir(), trimmed.slice(2));
 }

 return trimmed;
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const normalizePath = (value) => {
 const normalized = normalizeDirectoryPath(value);
 if (typeof normalized !== 'string') {
  return normalized;
 }
 return normalized.replace(/\\/g, '/');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const normalizePath = (value) => {
  const normalized = normalizeDirectoryPath(value);
  if (typeof normalized !== 'string') {
    return normalized;
  }
  return normalized.replace(/\\/g, '/');
=======
const normalizePath = <Value>(value: Value) => {
  const normalized = normalizeDirectoryPath(value);
  if (!isPrimitiveString(normalized)) {
    return normalized;
  }
  return normalized.replace(/\\/g, '/');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const getGitIndexMutationQueueKey = (directory) => {
 const normalized = normalizeDirectoryPath(directory);
 if (!normalized) {
  return '';
 }
 return path.resolve(normalized);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const getGitIndexMutationQueueKey = (directory) => {
  const normalized = normalizeDirectoryPath(directory);
  if (!normalized) {
    return '';
  }
  return path.resolve(normalized);
=======
const getGitIndexMutationQueueKey = (directory: string) => {
  const normalized = normalizeDirectoryPath(directory);
  if (!normalized) {
    return '';
  }
  return path.resolve(normalized);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const withGitIndexMutationQueue = async (directory, task) => {
 let key = getGitIndexMutationQueueKey(directory);
 try {
  const directoryPath = normalizeDirectoryPath(directory);
  if (directoryPath) {
   const git = await createGit(directoryPath);
   key = await resolveGitRepositoryRoot(directoryPath, git);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const withGitIndexMutationQueue = async (directory, task) => {
  let key = getGitIndexMutationQueueKey(directory);
  try {
    const directoryPath = normalizeDirectoryPath(directory);
    if (directoryPath) {
      const git = await createGit(directoryPath);
      key = await resolveGitRepositoryRoot(directoryPath, git);
    }
  } catch {
    // Fall back to the normalized directory key when the repo root is unavailable.
  }
  if (!key) {
    return task();
=======
const withGitIndexMutationQueue = async <Result>(directory: string, task: () => Promise<Result>) => {
  let key = getGitIndexMutationQueueKey(directory);
  try {
    const directoryPath = normalizeDirectoryPath(directory);
    if (directoryPath) {
      const git = await createGit(directoryPath);
      key = await resolveGitRepositoryRoot(directoryPath, git);
    }
  } catch {
    void 0;
  }
  if (!key) {
    return task();
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 } catch {
  // Fall back to the normalized directory key when the repo root is unavailable.
 }
 if (!key) {
  return task();
 }

 const previous = gitIndexMutationQueues.get(key) || Promise.resolve();
 const current = previous.catch(() => { }).then(task);
 const tail = current.catch(() => { });
 gitIndexMutationQueues.set(key, tail);

 try {
  return await current;
 } finally {
  if (gitIndexMutationQueues.get(key) === tail) {
   gitIndexMutationQueues.delete(key);
  }
 }
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const normalizeFilePathList = (paths) => Array.from(new Set(
 (Array.isArray(paths) ? paths : [paths])
  .map((value) => String(value || '').trim())
  .filter(Boolean)
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const normalizeFilePathList = (paths) => Array.from(new Set(
  (Array.isArray(paths) ? paths : [paths])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
=======
const normalizeFilePathList = <Paths>(paths: Paths) => Array.from(new Set<string>(
  (Array.isArray(paths) ? paths : [paths])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
));

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const validateRepositoryFilePaths = (directoryPath, filePaths) => {
 const repoRoot = path.resolve(directoryPath);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const validateRepositoryFilePaths = (directoryPath, filePaths) => {
  const repoRoot = path.resolve(directoryPath);
=======
const validateRepositoryFilePaths = (directoryPath: string, filePaths: string[]) => {
  const repoRoot = path.resolve(directoryPath);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 for (const filePath of filePaths) {
  const absoluteTarget = path.resolve(repoRoot, filePath);
  if (!absoluteTarget.startsWith(repoRoot + path.sep) && absoluteTarget !== repoRoot) {
   throw new Error(`Path is outside repository: ${filePath}`);
  }
 }
};

const toGitPath = (value: string) => value.replace(/\\/g, '/');

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const isInsideOrSameDirectory = (root, target) => {
 const relative = path.relative(root, target);
 return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const isInsideOrSameDirectory = (root, target) => {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
=======
const isInsideOrSameDirectory = (root: string, target: string) => {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const resolveGitRepositoryRoot = async (directoryPath, git) => {
 const topLevel = await git.raw(['rev-parse', '--show-toplevel']);
 const normalizedTopLevel = normalizeGitOutputPath(topLevel.trim());
 return path.isAbsolute(normalizedTopLevel)
  ? path.resolve(normalizedTopLevel)
  : path.resolve(directoryPath, normalizedTopLevel);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const toRepositoryRoot = (directoryPath, topLevel) => {
  const normalizedTopLevel = normalizeGitOutputPath(topLevel.trim());
  return path.isAbsolute(normalizedTopLevel)
    ? path.resolve(normalizedTopLevel)
    : path.resolve(directoryPath, normalizedTopLevel);
=======
const toRepositoryRoot = (directoryPath: string, topLevel: string) => {
  const normalizedTopLevel = normalizeGitOutputPath(topLevel.trim());
  return path.isAbsolute(normalizedTopLevel)
    ? path.resolve(normalizedTopLevel)
    : path.resolve(directoryPath, normalizedTopLevel);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const createRepositoryGitContext = async (directory, gitOptions = {}) => {
 const directoryPath = normalizeDirectoryPath(directory);
 if (typeof directoryPath !== 'string' || !directoryPath.trim()) {
  throw new Error('Git directory is required');
 }
 const directoryGit = await createGit(directoryPath, gitOptions);
 const repoRoot = await resolveGitRepositoryRoot(directoryPath, directoryGit);
 const git = path.resolve(directoryPath) === repoRoot ? directoryGit : await createGit(repoRoot, gitOptions);
 return { directoryPath, directoryGit, repoRoot, git };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const resolveGitRepositoryRoot = async (directoryPath, git) => (
  toRepositoryRoot(directoryPath, await git.raw(['rev-parse', '--show-toplevel']))
);

const createRepositoryGitContext = async (directory, gitOptions = {}) => {
  const directoryPath = normalizeDirectoryPath(directory);
  if (typeof directoryPath !== 'string' || !directoryPath.trim()) {
    throw new Error('Git directory is required');
  }
  const directoryGit = await createGit(directoryPath, gitOptions);
  const repoRoot = await resolveGitRepositoryRoot(directoryPath, directoryGit);
  const git = path.resolve(directoryPath) === repoRoot ? directoryGit : await createGit(repoRoot, gitOptions);
  return { directoryPath, directoryGit, repoRoot, git };
=======
const resolveGitRepositoryRoot = async (directoryPath: string, git: SimpleGit) => (
  toRepositoryRoot(directoryPath, await git.raw(['rev-parse', '--show-toplevel']))
);

const createRepositoryGitContext = async (directory: string, gitOptions: GitOptions = {}) => {
  const directoryPath = normalizeDirectoryPath(directory);
  if (!isPrimitiveString(directoryPath) || !directoryPath.trim()) {
    throw new Error('Git directory is required');
  }
  const directoryGit = await createGit(directoryPath, gitOptions);
  const repoRoot = await resolveGitRepositoryRoot(directoryPath, directoryGit);
  const git = path.resolve(directoryPath) === repoRoot ? directoryGit : await createGit(repoRoot, gitOptions);
  return { directoryPath, directoryGit, repoRoot, git };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Absolute repository root for a directory anywhere inside it. Callers that key
 * persisted data by repository need this so two directories in the same
 * repository do not address different records.
 */
export async function getRepositoryRoot(directory) {
 const { repoRoot } = await createRepositoryGitContext(directory);
 return repoRoot;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Absolute repository root for a directory anywhere inside it. Callers that key
 * persisted data by repository need this so two directories in the same
 * repository do not address different records.
 */
export async function getRepositoryRoot(directory) {
  const { repoRoot } = await createRepositoryGitContext(directory);
  return repoRoot;
=======
export async function getRepositoryRoot(directory: string) {
  const { repoRoot } = await createRepositoryGitContext(directory);
  return repoRoot;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const resolveGitInternalPath = async (repoRoot, git, gitPath) => {
 const resolved = await git.raw(['rev-parse', '--git-path', gitPath]);
 return path.resolve(repoRoot, normalizeGitOutputPath(resolved.trim()));
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const resolveGitInternalPath = async (repoRoot, git, gitPath) => {
  const resolved = await git.raw(['rev-parse', '--git-path', gitPath]);
  return path.resolve(repoRoot, normalizeGitOutputPath(resolved.trim()));
=======
const resolveGitInternalPath = async (repoRoot: string, git: SimpleGit, gitPath: string) => {
  const resolved = await git.raw(['rev-parse', '--git-path', gitPath]);
  return path.resolve(repoRoot, normalizeGitOutputPath(resolved.trim()));
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

const GITLINK_MODE = '160000';

const GIT_PATH_NOT_FOUND = 'path_not_found';
const GIT_PATH_IS_NESTED_REPOSITORY = 'nested_repository';
const GIT_PATH_IS_UNTRACKED_DIRECTORY = 'untracked_directory';

const GIT_PATH_ERROR_MESSAGES = {
<<<<<<< HEAD:packages/web/server/lib/git/service.js
 [GIT_PATH_IS_NESTED_REPOSITORY]: (filePath) => `Path is a separate Git repository: ${filePath}`,
 [GIT_PATH_IS_UNTRACKED_DIRECTORY]: (filePath) => `Path is a directory of untracked files: ${filePath}`,
 [GIT_PATH_NOT_FOUND]: (filePath) => `Path not found in working tree, index, or HEAD: ${filePath}`,
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  [GIT_PATH_IS_NESTED_REPOSITORY]: (filePath) => `Path is a separate Git repository: ${filePath}`,
  [GIT_PATH_IS_UNTRACKED_DIRECTORY]: (filePath) => `Path is a directory of untracked files: ${filePath}`,
  [GIT_PATH_NOT_FOUND]: (filePath) => `Path not found in working tree, index, or HEAD: ${filePath}`,
=======
  [GIT_PATH_IS_NESTED_REPOSITORY]: (filePath: string) => `Path is a separate Git repository: ${filePath}`,
  [GIT_PATH_IS_UNTRACKED_DIRECTORY]: (filePath: string) => `Path is a directory of untracked files: ${filePath}`,
  [GIT_PATH_NOT_FOUND]: (filePath: string) => `Path not found in working tree, index, or HEAD: ${filePath}`,
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

const createGitPathError = (code: keyof typeof GIT_PATH_ERROR_MESSAGES, filePath: string) => Object.assign(new Error(GIT_PATH_ERROR_MESSAGES[code](filePath)), { code });

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Mode of the exact entry at `repoPath`, or null. `cat-file -e` cannot answer
// this: a gitlink's commit lives in the submodule's object store, so git exits 1
// without stderr, which simple-git reports as success.
const readGitEntryMode = async (repoRoot, args, repoPath) => {
 const result = await runGitCommand(repoRoot, args);
 if (!result.success) return null;
 for (const record of result.stdout.split('\0')) {
  const tab = record.indexOf('\t');
  if (tab !== -1 && record.slice(tab + 1) === repoPath) {
   return record.slice(0, record.indexOf(' '));
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Mode of the exact entry at `repoPath`, or null. `cat-file -e` cannot answer
// this: a gitlink's commit lives in the submodule's object store, so git exits 1
// without stderr, which simple-git reports as success.
const readGitEntryMode = async (repoRoot, args, repoPath) => {
  const result = await runGitCommand(repoRoot, args);
  if (!result.success) return null;
  for (const record of result.stdout.split('\0')) {
    const tab = record.indexOf('\t');
    if (tab !== -1 && record.slice(tab + 1) === repoPath) {
      return record.slice(0, record.indexOf(' '));
    }
=======
const readGitEntryMode = async (repoRoot: string, args: string[], repoPath: string) => {
  const result = await runGitCommand(repoRoot, args);
  if (!result.success) return null;
  for (const record of result.stdout.split('\0')) {
    const tab = record.indexOf('\t');
    if (tab !== -1 && record.slice(tab + 1) === repoPath) {
      return record.slice(0, record.indexOf(' '));
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 }
 return null;
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const resolveGitFileContext = async (directoryPath, git, filePath, repoRootOverride = null) => {
 const repoRoot = repoRootOverride || await resolveGitRepositoryRoot(directoryPath, git);
 const candidates = Array.from(new Set([
  path.resolve(repoRoot, filePath),
  path.resolve(directoryPath, filePath),
 ]));
 let nestedRepository = false;
 let untrackedDirectory = false;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const resolveGitFileContext = async (directoryPath, git, filePath, repoRootOverride = null) => {
  const repoRoot = repoRootOverride || await resolveGitRepositoryRoot(directoryPath, git);
  const candidates = Array.from(new Set([
    path.resolve(repoRoot, filePath),
    path.resolve(directoryPath, filePath),
  ]));
  let nestedRepository = false;
  let untrackedDirectory = false;
=======
const resolveGitFileContext = async (directoryPath: string, git: SimpleGit, filePath: string | undefined, repoRootOverride: string | null = null) => {
  if (filePath === undefined) throw new TypeError('Git file path is required');
  const repoRoot = repoRootOverride || await resolveGitRepositoryRoot(directoryPath, git);
  const candidates = Array.from(new Set([
    path.resolve(repoRoot, filePath),
    path.resolve(directoryPath, filePath),
  ]));
  let nestedRepository = false;
  let untrackedDirectory = false;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 for (const absolutePath of candidates) {
  if (!isInsideOrSameDirectory(repoRoot, absolutePath)) {
   continue;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  for (const absolutePath of candidates) {
    if (!isInsideOrSameDirectory(repoRoot, absolutePath)) {
      continue;
    }

    const repoPath = toGitPath(path.relative(repoRoot, absolutePath));
    const worktreeEntry = await fsp.lstat(absolutePath).catch(() => null);
    const isSymbolicLink = worktreeEntry?.isSymbolicLink() ?? false;
    const existsInWorktree = worktreeEntry?.isFile() || isSymbolicLink;
    const indexMode = await readGitEntryMode(repoRoot, ['ls-files', '--stage', '-z', '--', `:(literal)${repoPath}`], repoPath);
    const headMode = await readGitEntryMode(repoRoot, ['ls-tree', '-z', 'HEAD', '--', repoPath], repoPath);

    if (existsInWorktree || indexMode || headMode) {
      return {
        absolutePath,
        repoPath,
        repoRoot,
        isSymbolicLink,
        isSubmodule: indexMode === GITLINK_MODE || headMode === GITLINK_MODE,
      };
    }

    if (worktreeEntry?.isDirectory()) {
      if (await fsp.lstat(path.join(absolutePath, '.git')).then(() => true, () => false)) {
        nestedRepository = true;
      } else {
        // Status lists a directory whose untracked files were not expanded
        // (see readStatus) as `dir/`; there is no single patch for it.
        untrackedDirectory = true;
      }
    }
=======
  for (const absolutePath of candidates) {
    if (!isInsideOrSameDirectory(repoRoot, absolutePath)) {
      continue;
    }

    const repoPath = toGitPath(path.relative(repoRoot, absolutePath));
    const worktreeEntry = await fsp.lstat(absolutePath).catch(() => null);
    const isSymbolicLink = worktreeEntry?.isSymbolicLink() ?? false;
    const existsInWorktree = worktreeEntry?.isFile() || isSymbolicLink;
    const indexMode = await readGitEntryMode(repoRoot, ['ls-files', '--stage', '-z', '--', `:(literal)${repoPath}`], repoPath);
    const headMode = await readGitEntryMode(repoRoot, ['ls-tree', '-z', 'HEAD', '--', repoPath], repoPath);

    if (existsInWorktree || indexMode || headMode) {
      return {
        absolutePath,
        repoPath,
        repoRoot,
        isSymbolicLink,
        isSubmodule: indexMode === GITLINK_MODE || headMode === GITLINK_MODE,
      };
    }

    if (worktreeEntry?.isDirectory()) {
      if (await fsp.lstat(path.join(absolutePath, '.git')).then(() => true, () => false)) {
        nestedRepository = true;
      } else {
        untrackedDirectory = true;
      }
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

  const repoPath = toGitPath(path.relative(repoRoot, absolutePath));
  const worktreeEntry = await fsp.lstat(absolutePath).catch(() => null);
  const isSymbolicLink = worktreeEntry?.isSymbolicLink() ?? false;
  const existsInWorktree = worktreeEntry?.isFile() || isSymbolicLink;
  const indexMode = await readGitEntryMode(repoRoot, ['ls-files', '--stage', '-z', '--', `:(literal)${repoPath}`], repoPath);
  const headMode = await readGitEntryMode(repoRoot, ['ls-tree', '-z', 'HEAD', '--', repoPath], repoPath);

  if (existsInWorktree || indexMode || headMode) {
   return {
    absolutePath,
    repoPath,
    repoRoot,
    isSymbolicLink,
    isSubmodule: indexMode === GITLINK_MODE || headMode === GITLINK_MODE,
   };
  }

  if (worktreeEntry?.isDirectory()) {
   if (await fsp.lstat(path.join(absolutePath, '.git')).then(() => true, () => false)) {
    nestedRepository = true;
   } else {
    // Status lists a directory whose untracked files were not expanded
    // (see readStatus) as `dir/`; there is no single patch for it.
    untrackedDirectory = true;
   }
  }
 }

 if (nestedRepository) throw createGitPathError(GIT_PATH_IS_NESTED_REPOSITORY, filePath);
 if (untrackedDirectory) throw createGitPathError(GIT_PATH_IS_UNTRACKED_DIRECTORY, filePath);
 throw createGitPathError(GIT_PATH_NOT_FOUND, filePath);
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * What a submodule entry records, since its text patch cannot show everything:
 * with only untracked files inside, `git status` marks it modified while
 * `git diff` prints nothing.
 */
const readSubmoduleState = async (repoRoot, fileContext) => {
 const status = await runGitCommand(repoRoot, ['status', '--porcelain=v2', '-z', '--', `:(literal)${fileContext.repoPath}`]);
 if (!status.success) {
  throw new Error(status.message || 'Failed to read submodule status');
 }
 // Changed: "1 XY S<c><m><u> mH mI mW hH hI path" ("2" adds rename fields
 // after hI). Unmerged: "u XY S<c><m><u> m1 m2 m3 mW h1 h2 h3 path", with no
 // stage-0 index entry. A clean submodule has no record, so HEAD and the index
 // record the same commit.
 const record = status.stdout.split('\0').find((entry) => /^[12u] /.test(entry))?.split(' ');
 const hasConflict = record?.[0] === 'u';
 const readHead = async () => (await runGitCommand(repoRoot, ['rev-parse', '--verify', '--quiet', `HEAD:${fileContext.repoPath}`])).stdout.trim();
 const head = record && !hasConflict ? record[6] : await readHead();
 const index = hasConflict ? '' : (record ? record[7] : head);
 const flags = record ? record[2] : 'S...';
 // Without its own `.git`, rev-parse would answer for the parent repository.
 const initialized = await fsp.lstat(path.join(fileContext.absolutePath, '.git')).then(() => true, () => false);
 const worktree = initialized ? await runGitCommand(fileContext.absolutePath, ['rev-parse', '--verify', 'HEAD']) : null;
 const commitOrNull = (value) => (value && !/^0+$/.test(value) ? value : null);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * What a submodule entry records, since its text patch cannot show everything:
 * with only untracked files inside, `git status` marks it modified while
 * `git diff` prints nothing.
 */
const readSubmoduleState = async (repoRoot, fileContext) => {
  const status = await runGitCommand(repoRoot, ['status', '--porcelain=v2', '-z', '--', `:(literal)${fileContext.repoPath}`]);
  if (!status.success) {
    throw new Error(status.message || 'Failed to read submodule status');
  }
  // Changed: "1 XY S<c><m><u> mH mI mW hH hI path" ("2" adds rename fields
  // after hI). Unmerged: "u XY S<c><m><u> m1 m2 m3 mW h1 h2 h3 path", with no
  // stage-0 index entry. A clean submodule has no record, so HEAD and the index
  // record the same commit.
  const record = status.stdout.split('\0').find((entry) => /^[12u] /.test(entry))?.split(' ');
  const hasConflict = record?.[0] === 'u';
  const readHead = async () => (await runGitCommand(repoRoot, ['rev-parse', '--verify', '--quiet', `HEAD:${fileContext.repoPath}`])).stdout.trim();
  const head = record && !hasConflict ? record[6] : await readHead();
  const index = hasConflict ? '' : (record ? record[7] : head);
  const flags = record ? record[2] : 'S...';
  // Without its own `.git`, rev-parse would answer for the parent repository.
  const initialized = await fsp.lstat(path.join(fileContext.absolutePath, '.git')).then(() => true, () => false);
  const worktree = initialized ? await runGitCommand(fileContext.absolutePath, ['rev-parse', '--verify', 'HEAD']) : null;
  const commitOrNull = (value) => (value && !/^0+$/.test(value) ? value : null);
=======
const readSubmoduleState = async (repoRoot: string, fileContext: GitFileContext) => {
  const status = await runGitCommand(repoRoot, ['status', '--porcelain=v2', '-z', '--', `:(literal)${fileContext.repoPath}`]);
  if (!status.success) {
    throw new Error(status.message || 'Failed to read submodule status');
  }
  const record = status.stdout.split('\0').find((entry) => /^[12u] /.test(entry))?.split(' ');
  const hasConflict = record?.[0] === 'u';
  const readHead = async () => (await runGitCommand(repoRoot, ['rev-parse', '--verify', '--quiet', `HEAD:${fileContext.repoPath}`])).stdout.trim();
  const head = record && !hasConflict ? record[6] : await readHead();
  const index = hasConflict ? '' : (record ? record[7] : head);
  const flags = record ? record[2] : 'S...';
  const initialized = await fsp.lstat(path.join(fileContext.absolutePath, '.git')).then(() => true, () => false);
  const worktree = initialized ? await runGitCommand(fileContext.absolutePath, ['rev-parse', '--verify', 'HEAD']) : null;
  const commitOrNull = (value: string | undefined) => (value && !/^0+$/.test(value) ? value : null);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 return {
  headCommit: commitOrNull(head),
  indexCommit: commitOrNull(index),
  worktreeCommit: worktree?.success ? worktree.stdout.trim() : null,
  hasTrackedChanges: flags[2] === 'M',
  hasUntrackedFiles: flags[3] === 'U',
  hasConflict,
 };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  return {
    headCommit: commitOrNull(head),
    indexCommit: commitOrNull(index),
    worktreeCommit: worktree?.success ? worktree.stdout.trim() : null,
    hasTrackedChanges: flags[2] === 'M',
    hasUntrackedFiles: flags[3] === 'U',
    hasConflict,
  };
=======
  return {
    headCommit: commitOrNull(head),
    indexCommit: commitOrNull(index),
    worktreeCommit: worktree?.success ? worktree.stdout.trim() : null,
    hasTrackedChanges: submoduleFlag(flags, 2) === 'M',
    hasUntrackedFiles: submoduleFlag(flags, 3) === 'U',
    hasConflict,
  };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const cleanBranchName = (branch) => {
 if (!branch) {
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const cleanBranchName = (branch) => {
  if (!branch) {
    return branch;
  }
  if (branch.startsWith('refs/heads/')) {
    return branch.substring('refs/heads/'.length);
  }
  if (branch.startsWith('heads/')) {
    return branch.substring('heads/'.length);
  }
  if (branch.startsWith('refs/')) {
    return branch.substring('refs/'.length);
  }
=======
const submoduleFlag = (flags: string | undefined, index: number) => {
  if (flags === undefined) throw new TypeError(`Cannot read properties of undefined (reading '${index}')`);
  return flags[index];
};

const cleanBranchName = (branch: string) => {
  if (!branch) {
    return branch;
  }
  if (branch.startsWith('refs/heads/')) {
    return branch.substring('refs/heads/'.length);
  }
  if (branch.startsWith('heads/')) {
    return branch.substring('heads/'.length);
  }
  if (branch.startsWith('refs/')) {
    return branch.substring('refs/'.length);
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  return branch;
 }
 if (branch.startsWith('refs/heads/')) {
  return branch.substring('refs/heads/'.length);
 }
 if (branch.startsWith('heads/')) {
  return branch.substring('heads/'.length);
 }
 if (branch.startsWith('refs/')) {
  return branch.substring('refs/'.length);
 }
 return branch;
};

const OPENCODE_ADJECTIVES = [
 'brave',
 'calm',
 'clever',
 'cosmic',
 'crisp',
 'curious',
 'eager',
 'gentle',
 'glowing',
 'happy',
 'hidden',
 'jolly',
 'kind',
 'lucky',
 'mighty',
 'misty',
 'neon',
 'nimble',
 'playful',
 'proud',
 'quick',
 'quiet',
 'shiny',
 'silent',
 'stellar',
 'sunny',
 'swift',
 'tidy',
 'witty',
];

const OPENCODE_NOUNS = [
 'cabin',
 'cactus',
 'canyon',
 'circuit',
 'comet',
 'eagle',
 'engine',
 'falcon',
 'forest',
 'garden',
 'harbor',
 'island',
 'knight',
 'lagoon',
 'meadow',
 'moon',
 'mountain',
 'nebula',
 'orchid',
 'otter',
 'panda',
 'pixel',
 'planet',
 'river',
 'rocket',
 'sailor',
 'squid',
 'star',
 'tiger',
 'wizard',
 'wolf',
];

const OPENCODE_WORKTREE_ATTEMPTS = 26;

// OpenChamber's own data directory owns the per-project worktree folder.
// `OPENCHAMBER_DATA_DIR` matches the root the Host composition uses for every
// other OpenChamber-owned folder.
const getOpenChamberDataPath = () => (
 process.env.OPENCHAMBER_DATA_DIR
  ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
  : path.join(os.homedir(), '.config', 'ohpichamber')
);

const pickRandom = (values: string[]) => values[Math.floor(Math.random() * values.length)];

const generateOpenCodeRandomName = () => `${pickRandom(OPENCODE_ADJECTIVES)}-${pickRandom(OPENCODE_NOUNS)}`;

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const slugWorktreeName = (value) => {
 return String(value || '')
  .trim()
  .replace(/^refs\/heads\//, '')
  .replace(/^heads\//, '')
  .replace(/\s+/g, '-')
  .replace(/^\/+|\/+$/g, '')
  .split('/').join('-')
  .replace(/[^A-Za-z0-9._-]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-+/, '')
  .replace(/-+$/, '')
  .slice(0, 80);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const slugWorktreeName = (value) => {
  return String(value || '')
    .trim()
    .replace(/^refs\/heads\//, '')
    .replace(/^heads\//, '')
    .replace(/\s+/g, '-')
    .replace(/^\/+|\/+$/g, '')
    .split('/').join('-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 80);
=======
const slugWorktreeName = (value: string) => {
  return String(value || '')
    .trim()
    .replace(/^refs\/heads\//, '')
    .replace(/^heads\//, '')
    .replace(/\s+/g, '-')
    .replace(/^\/+|\/+$/g, '')
    .split('/').join('-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 80);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const parseWorktreePorcelain = (raw) => {
 const lines = String(raw || '').split('\n').map((line) => line.trim());
 const entries = [];
 let current = null;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const parseWorktreePorcelain = (raw) => {
  const lines = String(raw || '').split('\n').map((line) => line.trim());
  const entries = [];
  let current = null;
=======
const parseWorktreePorcelain = (raw: string) => {
  const lines = String(raw || '').split('\n').map((line) => line.trim());
  const entries = [];
  let current: WorktreeEntry | null = null;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 for (const line of lines) {
  if (!line) {
   if (current?.worktree) {
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  for (const line of lines) {
    if (!line) {
      if (current?.worktree) {
        entries.push(current);
      }
      current = null;
      continue;
    }

    if (line.startsWith('worktree ')) {
      if (current?.worktree) {
        entries.push(current);
      }
      current = { worktree: normalizeGitOutputPath(line.substring('worktree '.length).trim()) };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('HEAD ')) {
      current.head = line.substring('HEAD '.length).trim();
      continue;
    }

    if (line.startsWith('branch ')) {
      const branchRef = line.substring('branch '.length).trim();
      current.branchRef = branchRef;
      current.branch = cleanBranchName(branchRef);
      continue;
    }

    // A bare repository lists itself as a worktree with a `bare` attribute
    // and no HEAD or branch; without a working tree it is not a checkout a
    // session can run in.
    if (line === 'bare') {
      current.bare = true;
      continue;
    }

    // git marks a worktree whose directory is gone (deleted outside git) as
    // prunable; it stays registered until `git worktree prune`. The sidebar
    // needs that distinction: the directory is missing, but the sessions that
    // lived there are not.
    if (line === 'prunable' || line.startsWith('prunable ')) {
      current.prunable = true;
    }
  }

  if (current?.worktree) {
=======
  for (const line of lines) {
    if (!line) {
      if (current?.worktree) {
        entries.push(current);
      }
      current = null;
      continue;
    }

    if (line.startsWith('worktree ')) {
      if (current?.worktree) {
        entries.push(current);
      }
      current = { worktree: normalizeGitOutputPath(line.substring('worktree '.length).trim()) };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('HEAD ')) {
      current.head = line.substring('HEAD '.length).trim();
      continue;
    }

    if (line.startsWith('branch ')) {
      const branchRef = line.substring('branch '.length).trim();
      current.branchRef = branchRef;
      current.branch = cleanBranchName(branchRef);
      continue;
    }

    if (line === 'bare') {
      current.bare = true;
      continue;
    }

    if (line === 'prunable' || line.startsWith('prunable ')) {
      current.prunable = true;
      continue;
    }

    if (line === 'locked' || line.startsWith('locked ')) {
      current.locked = true;
    }
  }

  if (current?.worktree) {
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    entries.push(current);
   }
   current = null;
   continue;
  }

  if (line.startsWith('worktree ')) {
   if (current?.worktree) {
    entries.push(current);
   }
   current = { worktree: normalizeGitOutputPath(line.substring('worktree '.length).trim()) };
   continue;
  }

  if (!current) {
   continue;
  }

  if (line.startsWith('HEAD ')) {
   current.head = line.substring('HEAD '.length).trim();
   continue;
  }

  if (line.startsWith('branch ')) {
   const branchRef = line.substring('branch '.length).trim();
   current.branchRef = branchRef;
   current.branch = cleanBranchName(branchRef);
   continue;
  }

  // A bare repository lists itself as a worktree with a `bare` attribute
  // and no HEAD or branch; without a working tree it is not a checkout a
  // session can run in.
  if (line === 'bare') {
   current.bare = true;
   continue;
  }

  // git marks a worktree whose directory is gone (deleted outside git) as
  // prunable; it stays registered until `git worktree prune`. The sidebar
  // needs that distinction: the directory is missing, but the sessions that
  // lived there are not.
  if (line === 'prunable' || line.startsWith('prunable ')) {
   current.prunable = true;
  }
 }

 if (current?.worktree) {
  entries.push(current);
 }

 return entries;
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const canonicalPath = async (input) => {
 const absolutePath = path.resolve(input);
 const realPath = await fsp.realpath(absolutePath).catch(() => absolutePath);
 const normalized = path.normalize(realPath);
 return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const canonicalPath = async (input) => {
  const absolutePath = path.resolve(input);
  const realPath = await fsp.realpath(absolutePath).catch(() => absolutePath);
  const normalized = path.normalize(realPath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
=======
const canonicalPath = async (input: string) => {
  const absolutePath = path.resolve(input);
  const realPath = await fsp.realpath(absolutePath).catch(() => absolutePath);
  const normalized = path.normalize(realPath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const checkPathExists = async (targetPath) => {
 try {
  await fsp.stat(targetPath);
  return true;
 } catch {
  return false;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const checkPathExists = async (targetPath) => {
  try {
    await fsp.stat(targetPath);
    return true;
  } catch {
    return false;
  }
=======
const checkPathExists = async (targetPath: string) => {
  try {
    await fsp.stat(targetPath);
    return true;
  } catch {
    return false;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const normalizeStartRef = (value) => {
 const trimmed = String(value || '').trim();
 if (!trimmed) {
  return 'HEAD';
 }
 return trimmed;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const normalizeStartRef = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return 'HEAD';
  }
  return trimmed;
=======
const normalizeStartRef = (value: string | null | undefined) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return 'HEAD';
  }
  return trimmed;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
function isValidCommitHash(hash) {
 return typeof hash === 'string' && /^[0-9a-fA-F]{7,40}$/.test(hash);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
function isValidCommitHash(hash) {
  return typeof hash === 'string' && /^[0-9a-fA-F]{7,40}$/.test(hash);
=======
function isValidCommitHash(hash: unknown): hash is string {
  return typeof hash === 'string' && /^[0-9a-fA-F]{7,40}$/.test(hash);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const parseRemoteBranchRef = (value) => {
 const trimmed = String(value || '').trim();
 if (!trimmed) {
  return null;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const parseRemoteBranchRef = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return null;
  }
=======
const parseRemoteBranchRef = (value: string): { remote: string; branch: string; remoteRef: string; fullRef: string } | null => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return null;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 if (trimmed.startsWith('refs/remotes/')) {
  const rest = trimmed.substring('refs/remotes/'.length);
  const slashIndex = rest.indexOf('/');
  if (slashIndex <= 0 || slashIndex === rest.length - 1) {
   return null;
  }
  return {
   remote: rest.slice(0, slashIndex),
   branch: rest.slice(slashIndex + 1),
   remoteRef: rest,
   fullRef: `refs/remotes/${rest}`,
  };
 }

 if (trimmed.startsWith('remotes/')) {
  return parseRemoteBranchRef(`refs/${trimmed}`);
 }

 const slashIndex = trimmed.indexOf('/');
 if (slashIndex <= 0 || slashIndex === trimmed.length - 1) {
  return null;
 }

 return {
  remote: trimmed.slice(0, slashIndex),
  branch: trimmed.slice(slashIndex + 1),
  remoteRef: trimmed,
  fullRef: `refs/remotes/${trimmed}`,
 };
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const resolveRemoteBranchRef = async (primaryWorktree, value) => {
 const raw = String(value || '').trim();
 const parsed = parseRemoteBranchRef(raw);
 if (!parsed) {
  return null;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const resolveRemoteBranchRef = async (primaryWorktree, value) => {
  const raw = String(value || '').trim();
  const parsed = parseRemoteBranchRef(raw);
  if (!parsed) {
    return null;
  }

  if (raw.startsWith('refs/remotes/') || raw.startsWith('remotes/')) {
    return parsed;
  }

  const localRef = `refs/heads/${raw}`;
  const localExists = await runGitCommand(primaryWorktree, ['show-ref', '--verify', '--quiet', localRef]);
  if (localExists.success) {
    return null;
  }
=======
const resolveRemoteBranchRef = async (primaryWorktree: string, value: string) => {
  const raw = String(value || '').trim();
  const parsed = parseRemoteBranchRef(raw);
  if (!parsed) {
    return null;
  }

  if (raw.startsWith('refs/remotes/') || raw.startsWith('remotes/')) {
    return parsed;
  }

  const localRef = `refs/heads/${raw}`;
  const localExists = await runGitCommand(primaryWorktree, ['show-ref', '--verify', '--quiet', localRef]);
  if (localExists.success) {
    return null;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 if (raw.startsWith('refs/remotes/') || raw.startsWith('remotes/')) {
  return parsed;
 }

 const localRef = `refs/heads/${raw}`;
 const localExists = await runGitCommand(primaryWorktree, ['show-ref', '--verify', '--quiet', localRef]);
 if (localExists.success) {
  return null;
 }

 return parsed;
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * The remote a checkout made from a local ref hydrates from.
 *
 * Submodules and Git LFS are fetched from the same place the checkout came
 * from. A remote-tracking start ref names that place; a local branch does not,
 * so its upstream remote stands in, and failing that the repository's only
 * remote. Null when nothing names one.
 */
const resolveCheckoutRemoteName = async (primaryWorktree, startRef) => {
 const raw = String(startRef || '').trim();
 const branch = raw && raw !== 'HEAD'
  ? raw.replace(/^refs\/heads\//, '')
  : (await runGitCommand(primaryWorktree, ['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.trim();
 if (branch) {
  const upstream = await runGitCommand(primaryWorktree, ['config', '--get', `branch.${branch}.remote`]);
  const name = upstream.success ? upstream.stdout.trim() : '';
  if (name) return name;
 }
 const remotes = await runGitCommand(primaryWorktree, ['remote']);
 const names = remotes.success ? remotes.stdout.split('\n').map((line) => line.trim()).filter(Boolean) : [];
 if (names.length === 1) return names[0];
 return names.includes('origin') ? 'origin' : '';
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * The remote a checkout made from a local ref hydrates from.
 *
 * Submodules and Git LFS are fetched from the same place the checkout came
 * from. A remote-tracking start ref names that place; a local branch does not,
 * so its upstream remote stands in, and failing that the repository's only
 * remote. Null when nothing names one.
 */
const resolveCheckoutRemoteName = async (primaryWorktree, startRef) => {
  const raw = String(startRef || '').trim();
  const branch = raw && raw !== 'HEAD'
    ? raw.replace(/^refs\/heads\//, '')
    : (await runGitCommand(primaryWorktree, ['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.trim();
  if (branch) {
    const upstream = await runGitCommand(primaryWorktree, ['config', '--get', `branch.${branch}.remote`]);
    const name = upstream.success ? upstream.stdout.trim() : '';
    if (name) return name;
  }
  const remotes = await runGitCommand(primaryWorktree, ['remote']);
  const names = remotes.success ? remotes.stdout.split('\n').map((line) => line.trim()).filter(Boolean) : [];
  if (names.length === 1) return names[0];
  return names.includes('origin') ? 'origin' : '';
=======
const resolveCheckoutRemoteName = async (primaryWorktree: string, startRef: string) => {
  const raw = String(startRef || '').trim();
  const branch = raw && raw !== 'HEAD'
    ? raw.replace(/^refs\/heads\//, '')
    : (await runGitCommand(primaryWorktree, ['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.trim();
  if (branch) {
    const upstream = await runGitCommand(primaryWorktree, ['config', '--get', `branch.${branch}.remote`]);
    const name = upstream.success ? upstream.stdout.trim() : '';
    if (name) return name;
  }
  const remotes = await runGitCommand(primaryWorktree, ['remote']);
  const names = remotes.success ? remotes.stdout.split('\n').map((line) => line.trim()).filter(Boolean) : [];
  if (names.length === 1) return names[0];
  return names.includes('origin') ? 'origin' : '';
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const normalizeUpstreamTarget = (remote, branch) => {
 const remoteName = String(remote || '').trim();
 const branchName = String(branch || '').trim();
 if (!remoteName || !branchName) {
  return null;
 }
 return {
  remote: remoteName,
  branch: branchName,
  full: `${remoteName}/${branchName}`,
 };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const normalizeUpstreamTarget = (remote, branch) => {
  const remoteName = String(remote || '').trim();
  const branchName = String(branch || '').trim();
  if (!remoteName || !branchName) {
    return null;
  }
  return {
    remote: remoteName,
    branch: branchName,
    full: `${remoteName}/${branchName}`,
  };
=======
const normalizeUpstreamTarget = (remote: string, branch: string) => {
  const remoteName = String(remote || '').trim();
  const branchName = String(branch || '').trim();
  if (!remoteName || !branchName) {
    return null;
  }
  return {
    remote: remoteName,
    branch: branchName,
    full: `${remoteName}/${branchName}`,
  };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const parseGitErrorText = (error) => {
 const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
 const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
 const message = typeof error?.message === 'string' ? error.message : '';
 // Some runtimes (notably Bun + simple-git GitError) surface the fatal text
 // primarily via message/toString; keep String(error) as a last resort so
 // "not a git repository" matching never misses and aborts callers.
 const fallback = !message && error != null ? String(error) : '';
 const chunks = [stderr, stdout, message, fallback]
  .map((chunk) => String(chunk || '').trim())
  .filter(Boolean);
 // execFile's message already embeds stderr; a chunk another one contains
 // would print every git error line twice.
 return chunks
  .filter((chunk, index) => !chunks.some((other, otherIndex) => otherIndex !== index && other.length > chunk.length && other.includes(chunk)))
  .join('\n')
  .trim();
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const parseGitErrorText = (error) => {
  const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
  const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
  const message = typeof error?.message === 'string' ? error.message : '';
  // Some runtimes (notably Bun + simple-git GitError) surface the fatal text
  // primarily via message/toString; keep String(error) as a last resort so
  // "not a git repository" matching never misses and aborts callers.
  const fallback = !message && error != null ? String(error) : '';
  const chunks = [stderr, stdout, message, fallback]
    .map((chunk) => String(chunk || '').trim())
    .filter(Boolean);
  // execFile's message already embeds stderr; a chunk another one contains
  // would print every git error line twice.
  return chunks
    .filter((chunk, index) => !chunks.some((other, otherIndex) => otherIndex !== index && other.length > chunk.length && other.includes(chunk)))
    .join('\n')
    .trim();
=======
const hasErrorFields = (value: unknown): value is ErrorFields => value !== null && value !== undefined;
const errorField = <Failure>(value: Failure, key: keyof ErrorFields) => hasErrorFields(value) ? value[key] : undefined;

const isPrimitiveString = (value: unknown): value is string => typeof value === 'string';
const isObjectValue = (value: unknown): value is object => value !== null && typeof value === 'object';
const isInteger = (value: unknown): value is number => Number.isInteger(value);

const isBootstrapPersistenceFailure = (value: unknown): value is { code: string; bootstrapStatus: WorktreeBootstrapState } => {
  if (!hasErrorFields(value) || value.code !== 'WORKTREE_BOOTSTRAP_PERSISTENCE_FAILED') return false;
  const state = value.bootstrapStatus;
  return hasBootstrapStateFields(state)
    && typeof state.status === 'string' && typeof state.phase === 'string'
    && (state.error === null || typeof state.error === 'string') && typeof state.updatedAt === 'number'
    && state.hydration === undefined;
};

const hasBootstrapStateFields = (value: unknown): value is {
  status?: unknown; phase?: unknown; error?: unknown; updatedAt?: unknown; hydration?: unknown;
} => value !== null && value !== undefined;

const parseGitErrorText = <Failure>(error: Failure) => {
  const rawStderr = errorField(error, 'stderr');
  const rawStdout = errorField(error, 'stdout');
  const rawMessage = errorField(error, 'message');
  const stderr = isPrimitiveString(rawStderr) ? rawStderr : '';
  const stdout = isPrimitiveString(rawStdout) ? rawStdout : '';
  const message = isPrimitiveString(rawMessage) ? rawMessage : '';
  const fallback = !message && error != null ? String(error) : '';
  const chunks = [stderr, stdout, message, fallback]
    .map((chunk) => String(chunk || '').trim())
    .filter(Boolean);
  return chunks
    .filter((chunk, index) => !chunks.some((other, otherIndex) => otherIndex !== index && other.length > chunk.length && other.includes(chunk)))
    .join('\n')
    .trim();
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const parseAheadBehindCounts = (value) => {
 const [aheadRaw, behindRaw] = String(value || '').trim().split(/\s+/);
 const ahead = parseInt(aheadRaw, 10);
 const behind = parseInt(behindRaw, 10);
 if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
  return null;
 }
 return { ahead, behind };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const parseAheadBehindCounts = (value) => {
  const [aheadRaw, behindRaw] = String(value || '').trim().split(/\s+/);
  const ahead = parseInt(aheadRaw, 10);
  const behind = parseInt(behindRaw, 10);
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
    return null;
  }
  return { ahead, behind };
=======
const parseAheadBehindCounts = (value: string) => {
  const [aheadRaw, behindRaw] = String(value || '').trim().split(/\s+/);
  const ahead = parseInt(String(aheadRaw), 10);
  const behind = parseInt(String(behindRaw), 10);
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
    return null;
  }
  return { ahead, behind };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const getRemoteExistenceCacheKey = (directory, remoteName) => {
 const normalizedDirectory = normalizeDirectoryPath(directory) || '';
 return `${path.resolve(normalizedDirectory)}\0${remoteName}`;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const getRemoteExistenceCacheKey = (directory, remoteName) => {
  const normalizedDirectory = normalizeDirectoryPath(directory) || '';
  return `${path.resolve(normalizedDirectory)}\0${remoteName}`;
=======
const getRemoteExistenceCacheKey = (directory: string, remoteName: string) => {
  const normalizedDirectory = normalizeDirectoryPath(directory) || '';
  return `${path.resolve(normalizedDirectory)}\0${remoteName}`;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const hasRemote = async (git, directory, remoteName) => {
 const remote = String(remoteName || '').trim();
 if (!remote) {
  return false;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const hasRemote = async (git, directory, remoteName) => {
  const remote = String(remoteName || '').trim();
  if (!remote) {
    return false;
  }
=======
const hasRemote = async (git: SimpleGit, directory: string, remoteName: string) => {
  const remote = String(remoteName || '').trim();
  if (!remote) {
    return false;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const key = getRemoteExistenceCacheKey(directory, remote);
 const cached = remoteExistenceCache.get(key);
 if (cached && Date.now() - cached.checkedAt < REMOTE_EXISTENCE_CACHE_TTL_MS) {
  return cached.exists;
 }

 const exists = await git
  .raw(['remote', 'get-url', '--', remote])
  .then((value) => String(value || '').trim().length > 0)
  .catch(() => false);

 remoteExistenceCache.set(key, { exists, checkedAt: Date.now() });
 return exists;
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const buildRawGitOptions = (raw) => {
 if (Array.isArray(raw)) {
  return raw.map((value) => String(value || '').trim()).filter(Boolean);
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const buildRawGitOptions = (raw) => {
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value || '').trim()).filter(Boolean);
  }
=======
const _buildRawGitOptions = (raw: string[] | Record<string, string | boolean | number | null>) => {
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value || '').trim()).filter(Boolean);
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 if (!raw || typeof raw !== 'object') {
  return [];
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  if (!raw || typeof raw !== 'object') {
    return [];
  }
=======
  if (!raw) {
    return [];
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 return Object.entries(raw).flatMap(([key, value]) => {
  const option = String(key || '').trim();
  if (!option || value === false) {
   return [];
  }
  if (value === true || value == null) {
   return [option];
  }
  return [option, String(value)];
 });
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const getRemoteBranchComparison = async (git, remoteName, branchName) => {
 const remote = String(remoteName || '').trim();
 const branch = String(branchName || '').trim();
 if (!remote || !branch) {
  return null;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const getRemoteBranchComparison = async (git, remoteName, branchName) => {
  const remote = String(remoteName || '').trim();
  const branch = String(branchName || '').trim();
  if (!remote || !branch) {
    return null;
  }
=======
const getRemoteBranchComparison = async (git: SimpleGit, remoteName: string, branchName: string) => {
  const remote = String(remoteName || '').trim();
  const branch = String(branchName || '').trim();
  if (!remote || !branch) {
    return null;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const remoteRef = `refs/remotes/${remote}/${branch}`;
 const exists = await git
  .raw(['rev-parse', '--verify', remoteRef])
  .then((value) => String(value || '').trim())
  .catch(() => '');
 if (!exists) {
  return null;
 }

 const countsRaw = await git
  .raw(['rev-list', '--left-right', '--count', `HEAD...${remoteRef}`])
  .then((value) => String(value || '').trim())
  .catch(() => '');
 const counts = parseAheadBehindCounts(countsRaw);
 if (!counts) {
  return null;
 }

 return {
  remote,
  branch,
  ahead: counts.ahead,
  behind: counts.behind,
 };
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const isNotGitRepositoryError = (error) => {
 const text = parseGitErrorText(error);
 return /not a git repository/i.test(text);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const isNotGitRepositoryError = (error) => {
  const text = parseGitErrorText(error);
  return /not a git repository/i.test(text);
=======
const isNotGitRepositoryError = <Failure>(error: Failure) => {
  const text = parseGitErrorText(error);
  return /not a git repository/i.test(text);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// A directory that no longer exists (e.g. a worktree deleted while something
// was still polling its status) is an expected, benign condition — not a fault
// to scream about. simple-git throws "Cannot use simple-git on a directory that
// does not exist"; the underlying fs errors are ENOENT/ENOTDIR.
const isMissingDirectoryError = (error) => {
 const code = error?.code;
 if (code === 'ENOENT' || code === 'ENOTDIR') {
  return true;
 }
 const text = parseGitErrorText(error);
 return /directory that does not exist|does not exist|no such file or directory/i.test(text);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// A directory that no longer exists (e.g. a worktree deleted while something
// was still polling its status) is an expected, benign condition — not a fault
// to scream about. simple-git throws "Cannot use simple-git on a directory that
// does not exist"; the underlying fs errors are ENOENT/ENOTDIR.
const isMissingDirectoryError = (error) => {
  const code = error?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return true;
  }
  const text = parseGitErrorText(error);
  return /directory that does not exist|does not exist|no such file or directory/i.test(text);
=======
const isMissingDirectoryError = <Failure>(error: Failure) => {
  const code = errorField(error, 'code');
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return true;
  }
  const text = parseGitErrorText(error);
  return /directory that does not exist|does not exist|no such file or directory/i.test(text);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const runGitCommand = async (cwd, args, { env: envOverride, timeoutMs = 0 } = {}) => {
 try {
  const { stdout, stderr } = await execFileAsync(getGitBinary(), args, {
   cwd,
   env: envOverride || await buildGitEnv(cwd),
   windowsHide: true,
   maxBuffer: 20 * 1024 * 1024,
   // Only short probes pass a timeout; commands that legitimately run long
   // (a fetch into a temporary clone) keep the default of none.
   ...(timeoutMs > 0 ? { timeout: timeoutMs, killSignal: 'SIGKILL' } : {}),
  });
  return {
   success: true,
   exitCode: 0,
   stdout: String(stdout || ''),
   stderr: String(stderr || ''),
  };
 } catch (error) {
  return {
   success: false,
   exitCode: Number.isInteger(error?.code) ? error.code : null,
   stdout: String(error?.stdout || ''),
   stderr: String(error?.stderr || ''),
   message: parseGitErrorText(error),
   // Why Git gave no answer at all: killed by the timeout, or never started.
   timedOut: error?.killed === true,
   spawnFailed: error?.code === 'ENOENT' || error?.code === 'EACCES',
  };
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const runGitCommand = async (cwd, args, { env: envOverride, timeoutMs = 0 } = {}) => {
  try {
    const { stdout, stderr } = await execFileAsync(getGitBinary(), args, {
      cwd,
      env: envOverride || await buildGitEnv(cwd),
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
      // Only short probes pass a timeout; commands that legitimately run long
      // (a fetch into a temporary clone) keep the default of none.
      ...(timeoutMs > 0 ? { timeout: timeoutMs, killSignal: 'SIGKILL' } : {}),
    });
    return {
      success: true,
      exitCode: 0,
      stdout: String(stdout || ''),
      stderr: String(stderr || ''),
    };
  } catch (error) {
    return {
      success: false,
      exitCode: Number.isInteger(error?.code) ? error.code : null,
      stdout: String(error?.stdout || ''),
      stderr: String(error?.stderr || ''),
      message: parseGitErrorText(error),
      // Why Git gave no answer at all: killed by the timeout, or never started.
      timedOut: error?.killed === true,
      spawnFailed: error?.code === 'ENOENT' || error?.code === 'EACCES',
    };
  }
=======
const runGitCommand = async (cwd: string, args: string[], { env: envOverride, timeoutMs = 0 }: GitCommandOptions = {}): Promise<GitCommandResult> => {
  try {
    const options: import('node:child_process').ExecFileOptionsWithStringEncoding = {
      cwd,
      env: envOverride || await buildGitEnv(cwd),
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    };
    if (timeoutMs > 0) {
      options.timeout = timeoutMs;
      options.killSignal = 'SIGKILL';
    }
    const { stdout, stderr } = await execFileAsync(getGitBinary(), args, options);
    return {
      success: true,
      exitCode: 0,
      stdout: String(stdout || ''),
      stderr: String(stderr || ''),
    };
  } catch (error) {
    const code = errorField(error, 'code');
    return {
      success: false,
      exitCode: isInteger(code) ? code : null,
      stdout: String(errorField(error, 'stdout') || ''),
      stderr: String(errorField(error, 'stderr') || ''),
      message: parseGitErrorText(error),
      timedOut: errorField(error, 'killed') === true,
      spawnFailed: code === 'ENOENT' || code === 'EACCES',
    };
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const resolveGitCommitFilePath = async (repoRoot, hash, candidates) => {
 for (const candidate of candidates) {
  const [originalTreeResult, modifiedTreeResult] = await Promise.all([
   runGitCommand(repoRoot, ['ls-tree', '--name-only', `${hash}^`, '--', candidate]),
   runGitCommand(repoRoot, ['ls-tree', '--name-only', hash, '--', candidate]),
  ]);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const resolveGitCommitFilePath = async (repoRoot, hash, candidates) => {
  for (const candidate of candidates) {
    const [originalTreeResult, modifiedTreeResult] = await Promise.all([
      runGitCommand(repoRoot, ['ls-tree', '--name-only', `${hash}^`, '--', candidate]),
      runGitCommand(repoRoot, ['ls-tree', '--name-only', hash, '--', candidate]),
    ]);
=======
const resolveGitCommitFilePath = async (repoRoot: string, hash: string, candidates: string[]) => {
  for (const candidate of candidates) {
    const [originalTreeResult, modifiedTreeResult] = await Promise.all([
      runGitCommand(repoRoot, ['ls-tree', '--name-only', `${hash}^`, '--', candidate]),
      runGitCommand(repoRoot, ['ls-tree', '--name-only', hash, '--', candidate]),
    ]);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

  if ((originalTreeResult.success && originalTreeResult.stdout.trim()) || (modifiedTreeResult.success && modifiedTreeResult.stdout.trim())) {
   return candidate;
  }
 }

 throw new Error('Invalid file path');
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// simple-git refuses a GIT_EDITOR that OpenChamber sets unless
// allowUnsafeEditor is enabled, which would also let -c core.editor through.
// Run editor-free continuation commands directly instead.
const runGitCommandWithoutEditor = async (cwd, args) => {
 const result = await runGitCommand(cwd, args, { env: { GIT_EDITOR: 'true' } });
 if (!result.success) {
  throw new Error(result.message || 'Git command failed');
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// simple-git refuses a GIT_EDITOR that OpenChamber sets unless
// allowUnsafeEditor is enabled, which would also let -c core.editor through.
// Run editor-free continuation commands directly instead.
// The full git environment must survive the override: git execs the no-op
// editor through PATH, and an env of only GIT_EDITOR makes that spawn search
// the execvp fallback (/bin:/usr/bin), where NixOS has no `true`.
const runGitCommandWithoutEditor = async (cwd, args) => {
  const result = await runGitCommand(cwd, args, { env: { ...(await buildGitEnv(cwd)), GIT_EDITOR: 'true' } });
  if (!result.success) {
    throw new Error(result.message || 'Git command failed');
  }
=======
const runGitCommandWithoutEditor = async (cwd: string, args: string[]) => {
  const result = await runGitCommand(cwd, args, { env: { ...(await buildGitEnv(cwd)), GIT_EDITOR: 'true' } });
  if (!result.success) {
    throw new Error(result.message || 'Git command failed');
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const runGitCommandOrThrow = async (cwd, args, fallbackMessage) => {
 const result = await runGitCommand(cwd, args);
 if (!result.success) {
  throw new Error(result.message || fallbackMessage || 'Git command failed');
 }
 return result;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const runGitCommandOrThrow = async (cwd, args, fallbackMessage) => {
  const result = await runGitCommand(cwd, args);
  if (!result.success) {
    throw new Error(result.message || fallbackMessage || 'Git command failed');
  }
  return result;
=======
const runGitCommandOrThrow = async (cwd: string, args: string[], fallbackMessage?: string) => {
  const result = await runGitCommand(cwd, args);
  if (!result.success) {
    throw new Error(result.message || fallbackMessage || 'Git command failed');
  }
  return result;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const isIndexLockError = (result) => {
 const message = [result?.message, result?.stderr, result?.stdout].filter(Boolean).join('\n');
 return /index\.lock['"]?: File exists|another git process seems to be running/i.test(message);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const isIndexLockError = (result) => {
  const message = [result?.message, result?.stderr, result?.stdout].filter(Boolean).join('\n');
  return /index\.lock['"]?: File exists|another git process seems to be running/i.test(message);
=======
const isIndexLockError = (result: GitCommandResult) => {
  const message = [result?.message, result?.stderr, result?.stdout].filter(Boolean).join('\n');
  return /index\.lock['"]?: File exists|another git process seems to be running/i.test(message);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const getWorktreeIndexLockPath = async (directory) => {
 const result = await runGitCommand(directory, ['rev-parse', '--git-path', 'index.lock']);
 if (!result.success) {
  return null;
 }
 const value = normalizeGitOutputPath(String(result.stdout || '').trim());
 return value ? (path.isAbsolute(value) ? value : path.resolve(directory, value)) : null;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const getWorktreeIndexLockPath = async (directory) => {
  const result = await runGitCommand(directory, ['rev-parse', '--git-path', 'index.lock']);
  if (!result.success) {
    return null;
  }
  const value = normalizeGitOutputPath(String(result.stdout || '').trim());
  return value ? (path.isAbsolute(value) ? value : path.resolve(directory, value)) : null;
=======
const getWorktreeIndexLockPath = async (directory: string) => {
  const result = await runGitCommand(directory, ['rev-parse', '--git-path', 'index.lock']);
  if (!result.success) {
    return null;
  }
  const value = normalizeGitOutputPath(String(result.stdout || '').trim());
  return value ? (path.isAbsolute(value) ? value : path.resolve(directory, value)) : null;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const getFileIdentity = async (filePath) => {
 try {
  const stat = await fsp.stat(filePath);
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`;
 } catch (error) {
  if (error?.code === 'ENOENT') {
   return null;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const getFileIdentity = async (filePath) => {
  try {
    const stat = await fsp.stat(filePath);
    return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
=======
const getFileIdentity = async (filePath: string) => {
  try {
    const stat = await fsp.stat(filePath);
    return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`;
  } catch (error) {
    if (errorField(error, 'code') === 'ENOENT') {
      return null;
    }
    throw error;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  throw error;
 }
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// OpenChamber places managed worktrees under a deep data-dir path
// (`<OpenChamber data dir>/worktree/<40-char project id>/<name>/`). On
// Windows that prefix plus a deeply nested repo file routinely exceeds
// MAX_PATH (260). Git can check those paths out when core.longpaths is
// enabled; without it, `git reset --hard` during bootstrap fails with
// "Filename too long" and leaves a half-populated worktree (issue #2746).
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// OpenChamber places managed worktrees under a deep data-dir path
// (`<XDG_DATA_HOME>/opencode/worktree/<40-char project id>/<name>/`). On
// Windows that prefix plus a deeply nested repo file routinely exceeds
// MAX_PATH (260). Git can check those paths out when core.longpaths is
// enabled; without it, `git reset --hard` during bootstrap fails with
// "Filename too long" and leaves a half-populated worktree (issue #2746).
=======
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
const WORKTREE_POPULATE_CONFIG_ARGS = [
 '-c', 'core.longpaths=true',
 '-c', `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
 '-c', 'core.fsmonitor=false',
 '-c', 'submodule.recurse=false',
 '-c', 'fetch.recurseSubmodules=false',
 '-c', 'filter.lfs.process=',
 '-c', 'filter.lfs.smudge=',
 '-c', 'filter.lfs.clean=',
 '-c', 'filter.lfs.required=false',
];

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const buildWorktreePopulateCommand = async (directory) => {
 const env = {
  ...(await buildGitEnv(directory)),
  GIT_ALLOW_PROTOCOL: '',
  GIT_LFS_SKIP_SMUDGE: '1',
  GIT_NO_LAZY_FETCH: '1',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_TERMINAL_PROMPT: '0',
 };
 delete env.GIT_CONFIG_PARAMETERS;
 for (const key of Object.keys(env)) {
  if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/.test(key)) delete env[key];
 }
 const configured = await runGitCommand(directory, [
  ...WORKTREE_POPULATE_CONFIG_ARGS,
  'config', '--includes', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.(process|smudge|clean|required)$',
 ], { env });
 if (!configured.success && configured.exitCode !== 1) {
  throw new Error('Failed to inspect Git filters before populating worktree');
 }
 if (configured.stdout && !configured.stdout.endsWith('\0')) {
  throw new Error('Git filter configuration is invalid');
 }
 const filterArgs = [];
 for (const key of configured.stdout.split('\0').filter(Boolean)) {
  if (!/^filter\.[^\0\r\n=]+\.(process|smudge|clean|required)$/i.test(key)) {
   throw new Error('Git filter configuration is invalid');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const buildWorktreePopulateCommand = async (directory) => {
  const env = {
    ...(await buildGitEnv(directory)),
    GIT_ALLOW_PROTOCOL: '',
    GIT_LFS_SKIP_SMUDGE: '1',
    GIT_NO_LAZY_FETCH: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
  delete env.GIT_CONFIG_PARAMETERS;
  for (const key of Object.keys(env)) {
    if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/.test(key)) delete env[key];
=======
const buildWorktreePopulateCommand = async (directory: string) => {
  const env: NodeJS.ProcessEnv = {
    ...(await buildGitEnv(directory)),
    GIT_ALLOW_PROTOCOL: '',
    GIT_LFS_SKIP_SMUDGE: '1',
    GIT_NO_LAZY_FETCH: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
  delete env.GIT_CONFIG_PARAMETERS;
  for (const key of Object.keys(env)) {
    if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/.test(key)) delete env[key];
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  filterArgs.push('-c', `${key}=${key.toLowerCase().endsWith('.required') ? 'false' : ''}`);
 }
 return {
  args: [...WORKTREE_POPULATE_CONFIG_ARGS, ...filterArgs, 'reset', '--hard'],
  env,
 };
};

const isFilenameTooLongError = <Message>(message: Message) => /file ?name too long/i.test(String(message || ''));

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const formatWorktreePopulateError = (message) => {
 const text = String(message || '').trim() || 'Failed to populate worktree';
 if (!isFilenameTooLongError(text)) {
  return text;
 }
 return [
  text,
  'The worktree checkout path exceeds this system\'s path-length limit.',
  'OhPiChamber enables Git `core.longpaths` for worktree population; if this still fails on Windows, enable OS long paths (LongPathsEnabled) or open the repository from a shorter absolute path.',
 ].join('\n');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const formatWorktreePopulateError = (message) => {
  const text = String(message || '').trim() || 'Failed to populate worktree';
  if (!isFilenameTooLongError(text)) {
    return text;
  }
  return [
    text,
    'The worktree checkout path exceeds this system\'s path-length limit.',
    'OpenChamber enables Git `core.longpaths` for worktree population; if this still fails on Windows, enable OS long paths (LongPathsEnabled) or open the repository from a shorter absolute path.',
  ].join('\n');
=======
const formatWorktreePopulateError = <Message>(message: Message) => {
  const text = String(message || '').trim() || 'Failed to populate worktree';
  if (!isFilenameTooLongError(text)) {
    return text;
  }
  return [
    text,
    'The worktree checkout path exceeds this system\'s path-length limit.',
    'OpenChamber enables Git `core.longpaths` for worktree population; if this still fails on Windows, enable OS long paths (LongPathsEnabled) or open the repository from a shorter absolute path.',
  ].join('\n');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export const ensureWorktreeLongpaths = async (directory) => {
 const current = await runGitCommand(directory, ['config', '--get', 'core.longpaths']);
 if (String(current.stdout || '').trim().toLowerCase() === 'true') {
  return;
 }
 // Local config is shared across linked worktrees via the common git dir, so
 // subsequent OpenChamber and CLI git operations in this repo also get long
 // path support. Failures here are non-fatal: populate still passes
 // `-c core.longpaths=true` on reset.
 await runGitCommand(directory, ['config', 'core.longpaths', 'true']);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export const ensureWorktreeLongpaths = async (directory) => {
  const current = await runGitCommand(directory, ['config', '--get', 'core.longpaths']);
  if (String(current.stdout || '').trim().toLowerCase() === 'true') {
    return;
  }
  // Local config is shared across linked worktrees via the common git dir, so
  // subsequent OpenChamber and CLI git operations in this repo also get long
  // path support. Failures here are non-fatal: populate still passes
  // `-c core.longpaths=true` on reset.
  await runGitCommand(directory, ['config', 'core.longpaths', 'true']);
=======
export const ensureWorktreeLongpaths = async (directory: string) => {
  const current = await runGitCommand(directory, ['config', '--get', 'core.longpaths']);
  if (String(current.stdout || '').trim().toLowerCase() === 'true') {
    return;
  }
  await runGitCommand(directory, ['config', 'core.longpaths', 'true']);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export const populateWorktreeWithLockRecovery = async (directory) => {
 await ensureWorktreeLongpaths(directory);
 const command = await buildWorktreePopulateCommand(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export const populateWorktreeWithLockRecovery = async (directory) => {
  await ensureWorktreeLongpaths(directory);
  const command = await buildWorktreePopulateCommand(directory);
=======
export const populateWorktreeWithLockRecovery = async (directory: string) => {
  await ensureWorktreeLongpaths(directory);
  const command = await buildWorktreePopulateCommand(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 let result = await runGitCommand(directory, command.args, { env: command.env });
 if (result.success) {
  return;
 }
 if (!isIndexLockError(result)) {
  throw new Error(formatWorktreePopulateError(result.message));
 }

 await wait(WORKTREE_INDEX_LOCK_RETRY_DELAY_MS);
 result = await runGitCommand(directory, command.args, { env: command.env });
 if (result.success) {
  return;
 }
 if (!isIndexLockError(result)) {
  throw new Error(formatWorktreePopulateError(result.message));
 }

 const lockPath = await getWorktreeIndexLockPath(directory);
 const identity = lockPath ? await getFileIdentity(lockPath) : null;
 await wait(WORKTREE_INDEX_LOCK_STALE_DELAY_MS);

 result = await runGitCommand(directory, command.args, { env: command.env });
 if (result.success) {
  return;
 }
 if (!isIndexLockError(result) || !lockPath || !identity || await getFileIdentity(lockPath) !== identity) {
  throw new Error(formatWorktreePopulateError(result.message));
 }

 await fsp.unlink(lockPath).catch((error) => {
  if (error?.code !== 'ENOENT') {
   throw error;
  }
 });
 const finalResult = await runGitCommand(directory, command.args, { env: command.env });
 if (!finalResult.success) {
  throw new Error(formatWorktreePopulateError(finalResult.message || 'Failed to populate worktree'));
 }
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const inspectPostCheckoutHook = async (directory) => {
 const result = await runGitCommand(directory, ['rev-parse', '--git-path', 'hooks']);
 if (!result.success) return null;
 const hooksPath = normalizeDirectoryPath(normalizeGitOutputPath(String(result.stdout || '').trim()));
 if (!hooksPath) return null;
 const hookPath = path.join(path.isAbsolute(hooksPath) ? hooksPath : path.resolve(directory, hooksPath), 'post-checkout');
 let handle;
 try {
  handle = await fsp.open(hookPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const stat = await handle.stat();
  if (!stat.isFile() || (process.platform !== 'win32' && (stat.mode & 0o111) === 0)) return null;
  const content = await handle.readFile();
  const gitDirResult = await runGitCommand(directory, ['rev-parse', '--absolute-git-dir']);
  const gitDir = normalizeGitOutputPath(String(gitDirResult.stdout || '').trim());
  if (!gitDirResult.success || !gitDir) return null;
  return {
   kind: 'post-checkout-hook',
   path: hookPath,
   content,
   contentDigest: crypto.createHash('sha256').update(content).digest('base64url'),
   gitDir,
   workTree: path.resolve(directory),
  };
 } catch {
  return null;
 } finally {
  await handle?.close().catch(() => { });
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const inspectPostCheckoutHook = async (directory) => {
  const result = await runGitCommand(directory, ['rev-parse', '--git-path', 'hooks']);
  if (!result.success) return null;
  const hooksPath = normalizeDirectoryPath(normalizeGitOutputPath(String(result.stdout || '').trim()));
  if (!hooksPath) return null;
  const hookPath = path.join(path.isAbsolute(hooksPath) ? hooksPath : path.resolve(directory, hooksPath), 'post-checkout');
  let handle;
  try {
    handle = await fsp.open(hookPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || (process.platform !== 'win32' && (stat.mode & 0o111) === 0)) return null;
    const content = await handle.readFile();
    const gitDirResult = await runGitCommand(directory, ['rev-parse', '--absolute-git-dir']);
    const gitDir = normalizeGitOutputPath(String(gitDirResult.stdout || '').trim());
    if (!gitDirResult.success || !gitDir) return null;
    return {
      kind: 'post-checkout-hook',
      path: hookPath,
      content,
      contentDigest: crypto.createHash('sha256').update(content).digest('base64url'),
      gitDir,
      workTree: path.resolve(directory),
    };
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
=======
const inspectPostCheckoutHook = async (directory: string): Promise<PostCheckoutHookAction | null> => {
  const result = await runGitCommand(directory, ['rev-parse', '--git-path', 'hooks']);
  if (!result.success) return null;
  const hooksPath = normalizeDirectoryPath(normalizeGitOutputPath(String(result.stdout || '').trim()));
  if (!hooksPath) return null;
  const hookPath = path.join(path.isAbsolute(hooksPath) ? hooksPath : path.resolve(directory, hooksPath), 'post-checkout');
  let handle;
  try {
    handle = await fsp.open(hookPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || (process.platform !== 'win32' && (stat.mode & 0o111) === 0)) return null;
    const content = await handle.readFile();
    const gitDirResult = await runGitCommand(directory, ['rev-parse', '--absolute-git-dir']);
    const gitDir = normalizeGitOutputPath(String(gitDirResult.stdout || '').trim());
    if (!gitDirResult.success || !gitDir) return null;
    return {
      kind: 'post-checkout-hook',
      path: hookPath,
      content,
      contentDigest: crypto.createHash('sha256').update(content).digest('base64url'),
      gitDir,
      workTree: path.resolve(directory),
    };
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export const inspectContributorCheckoutActions = async (directory, provenance) => {
 const head = String((await runGitCommandOrThrow(directory, ['rev-parse', 'HEAD'], 'Failed to inspect worktree HEAD')).stdout || '').trim().toLowerCase();
 if (head !== provenance.sourceSha) throw Object.assign(new Error('Contributor worktree HEAD changed'), { code: 'STALE_CONFIG', status: 409 });
 const hook = await inspectPostCheckoutHook(directory);
 const setupCommand = String(provenance.setupCommand || '').trim();
 const actions = [];
 if (hook) actions.push(hook);
 if (setupCommand) actions.push({ kind: 'setup-command', command: setupCommand });
 const digestActions = actions.map((action) => action.kind === 'post-checkout-hook' ? {
  kind: action.kind,
  path: action.path,
  contentDigest: action.contentDigest,
  gitDir: action.gitDir,
  workTree: action.workTree,
  args: [GIT_NULL_REF, head, '1'],
 } : action);
 const digest = crypto.createHash('sha256').update(JSON.stringify({ head, actions: digestActions })).digest('base64url');
 return Object.freeze({ state: 'awaiting-trust', actions: Object.freeze(actions), digest });
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export const inspectContributorCheckoutActions = async (directory, provenance) => {
  const head = String((await runGitCommandOrThrow(directory, ['rev-parse', 'HEAD'], 'Failed to inspect worktree HEAD')).stdout || '').trim().toLowerCase();
  if (head !== provenance.sourceSha) throw Object.assign(new Error('Contributor worktree HEAD changed'), { code: 'STALE_CONFIG', status: 409 });
  const hook = await inspectPostCheckoutHook(directory);
  const projectCommand = await readProjectStartCommand((await resolvePrimaryWorktreeRoot(directory)).root);
  const setupCommand = String(provenance.setupCommand || '').trim();
  const actions = [];
  if (hook) actions.push(hook);
  if (projectCommand) actions.push({ kind: 'project-start-command', command: projectCommand });
  if (setupCommand) actions.push({ kind: 'setup-command', command: setupCommand });
  const digestActions = actions.map((action) => action.kind === 'post-checkout-hook' ? {
    kind: action.kind,
    path: action.path,
    contentDigest: action.contentDigest,
    gitDir: action.gitDir,
    workTree: action.workTree,
    args: [GIT_NULL_REF, head, '1'],
  } : action);
  const digest = crypto.createHash('sha256').update(JSON.stringify({ head, actions: digestActions })).digest('base64url');
  return Object.freeze({ state: 'awaiting-trust', actions: Object.freeze(actions), digest });
=======
export const inspectContributorCheckoutActions = async (directory: string, provenance: { sourceSha: string; setupCommand?: string }) => {
  const head = String((await runGitCommandOrThrow(directory, ['rev-parse', 'HEAD'], 'Failed to inspect worktree HEAD')).stdout || '').trim().toLowerCase();
  if (head !== provenance.sourceSha) throw Object.assign(new Error('Contributor worktree HEAD changed'), { code: 'STALE_CONFIG', status: 409 });
  const hook = await inspectPostCheckoutHook(directory);
  const projectCommand = await readProjectStartCommand((await resolvePrimaryWorktreeRoot(directory)).root);
  const setupCommand = String(provenance.setupCommand || '').trim();
  const actions: (NonNullable<Awaited<ReturnType<typeof inspectPostCheckoutHook>>> | { kind: 'project-start-command' | 'setup-command'; command: string })[] = [];
  if (hook) actions.push(hook);
  if (projectCommand) actions.push({ kind: 'project-start-command', command: projectCommand });
  if (setupCommand) actions.push({ kind: 'setup-command', command: setupCommand });
  const digestActions = actions.map((action) => action.kind === 'post-checkout-hook' ? {
    kind: action.kind,
    path: action.path,
    contentDigest: action.contentDigest,
    gitDir: action.gitDir,
    workTree: action.workTree,
    args: [GIT_NULL_REF, head, '1'],
  } : action);
  const digest = crypto.createHash('sha256').update(JSON.stringify({ head, actions: digestActions })).digest('base64url');
  return Object.freeze({ state: 'awaiting-trust', actions: Object.freeze(actions), digest });
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

const derivePrimaryWorktreeRootFromGitDir = (gitDir: string) => primaryWorktreeRootFromGitDir(normalizePath(gitDir));

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function resolvePrimaryWorktreeRoot(directory) {
 const result = await runGitCommand(directory, ['rev-parse', '--absolute-git-dir', '--git-common-dir']);
 if (!result.success) {
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function resolvePrimaryWorktreeRoot(directory) {
  const result = await runGitCommand(directory, ['rev-parse', '--absolute-git-dir', '--git-common-dir']);
  if (!result.success) {
    return { root: directory };
  }
  const lines = String(result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const absoluteGitDir = normalizePath(normalizeGitOutputPath(lines[0] || ''));
  const rootFromAbsoluteGitDir = derivePrimaryWorktreeRootFromGitDir(absoluteGitDir);
  if (rootFromAbsoluteGitDir) {
    return { root: rootFromAbsoluteGitDir };
  }
  const rawCommonDir = normalizePath(normalizeGitOutputPath(lines[1] || ''));
  if (rawCommonDir) {
    const commonDir = path.isAbsolute(rawCommonDir)
      ? rawCommonDir
      : path.resolve(directory, rawCommonDir);
    const rootFromCommonDir = derivePrimaryWorktreeRootFromGitDir(commonDir);
    if (rootFromCommonDir) {
      return { root: rootFromCommonDir };
    }
  }
=======
export async function resolvePrimaryWorktreeRoot(directory: string) {
  const result = await runGitCommand(directory, ['rev-parse', '--absolute-git-dir', '--git-common-dir']);
  if (!result.success) {
    return { root: directory };
  }
  const lines = String(result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const absoluteGitDir = normalizePath(normalizeGitOutputPath(lines[0] || ''));
  const rootFromAbsoluteGitDir = derivePrimaryWorktreeRootFromGitDir(absoluteGitDir);
  if (rootFromAbsoluteGitDir) {
    return { root: rootFromAbsoluteGitDir };
  }
  const rawCommonDir = normalizePath(normalizeGitOutputPath(lines[1] || ''));
  if (rawCommonDir) {
    const commonDir = path.isAbsolute(rawCommonDir)
      ? rawCommonDir
      : path.resolve(directory, rawCommonDir);
    const rootFromCommonDir = derivePrimaryWorktreeRootFromGitDir(commonDir);
    if (rootFromCommonDir) {
      return { root: rootFromCommonDir };
    }
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  return { root: directory };
 }
 const lines = String(result.stdout || '')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
 const absoluteGitDir = normalizePath(normalizeGitOutputPath(lines[0] || ''));
 const rootFromAbsoluteGitDir = derivePrimaryWorktreeRootFromGitDir(absoluteGitDir);
 if (rootFromAbsoluteGitDir) {
  return { root: rootFromAbsoluteGitDir };
 }
 const rawCommonDir = normalizePath(normalizeGitOutputPath(lines[1] || ''));
 if (rawCommonDir) {
  const commonDir = path.isAbsolute(rawCommonDir)
   ? rawCommonDir
   : path.resolve(directory, rawCommonDir);
  const rootFromCommonDir = derivePrimaryWorktreeRootFromGitDir(commonDir);
  if (rootFromCommonDir) {
   return { root: rootFromCommonDir };
  }
 }
 return { root: directory };
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function resolveRepositoryGitPaths(directory) {
 const result = await runGitCommand(directory, [
  'rev-parse',
  '--absolute-git-dir',
  '--path-format=absolute',
  '--git-common-dir',
  '--is-bare-repository',
 ]);
 if (!result.success) {
  return { supported: false, reason: 'not-a-git-repository' };
 }
 const lines = String(result.stdout || '').split('\n').map((line) => line.trim()).filter(Boolean);
 if (lines.length < 3) return { supported: false, reason: 'unresolved-git-directory' };
 const gitDirectory = path.resolve(directory, lines[0]);
 const commonDirectory = path.resolve(directory, lines[1]);
 return {
  supported: true,
  gitDirectory,
  commonDirectory,
  bare: lines[2] === 'true',
 };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function resolveRepositoryGitPaths(directory) {
  const result = await runGitCommand(directory, [
    'rev-parse',
    '--absolute-git-dir',
    '--path-format=absolute',
    '--git-common-dir',
    '--is-bare-repository',
  ]);
  if (!result.success) {
    return { supported: false, reason: 'not-a-git-repository' };
  }
  const lines = String(result.stdout || '').split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) return { supported: false, reason: 'unresolved-git-directory' };
  const gitDirectory = path.resolve(directory, lines[0]);
  const commonDirectory = path.resolve(directory, lines[1]);
  return {
    supported: true,
    gitDirectory,
    commonDirectory,
    bare: lines[2] === 'true',
  };
=======
export async function resolveRepositoryGitPaths(directory: string): Promise<RepositoryGitPaths> {
  const result = await runGitCommand(directory, [
    'rev-parse',
    '--absolute-git-dir',
    '--path-format=absolute',
    '--git-common-dir',
    '--is-bare-repository',
  ]);
  if (!result.success) {
    return { supported: false, reason: 'not-a-git-repository' };
  }
  const lines = String(result.stdout || '').split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) return { supported: false, reason: 'unresolved-git-directory' };
  const gitDirectory = path.resolve(directory, lines[0] ?? '');
  const commonDirectory = path.resolve(directory, lines[1] ?? '');
  return {
    supported: true,
    gitDirectory,
    commonDirectory,
    bare: lines[2] === 'true',
  };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Each listed remote's fetch and push URL from `git remote -v` output, as
 * `git remote get-url [--push]` reports them, the first URL of several. A
 * remote with no fetch URL is left out: Git lists it as a bare `name\t` line
 * and `get-url` answers its name, which is no address anyone configured. A
 * git-annex special remote is such a section. Lines may end in CRLF (Git for
 * Windows); a kept `\r` would match no line and read every remote as
 * URL-less. Anything after the URL-kind marker (Git 2.54+ appends the
 * partial-clone filter there as `[blob:none]`) is decoration about the
 * remote, never part of the URL, and is ignored whether or not its shape is
 * recognized.
 */
export function parseRemoteListing(names, listing) {
 const urls = new Map();
 for (const line of String(listing || '').split(/\r?\n/)) {
  const match = line.match(/^([^\t]+)\t(.*) \((fetch|push)\)/);
  if (!match) continue;
  const entry = urls.get(match[1]) ?? {};
  if (entry[match[3]] === undefined) entry[match[3]] = match[2];
  urls.set(match[1], entry);
 }
 return names.flatMap((name) => {
  const fetchUrl = urls.get(name)?.fetch;
  if (fetchUrl === undefined) return [];
  return [{ name, fetchUrl, pushUrl: urls.get(name)?.push ?? fetchUrl }];
 });
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Each listed remote's fetch and push URL from `git remote -v` output, as
 * `git remote get-url [--push]` reports them, the first URL of several. A
 * remote with no fetch URL is left out: Git lists it as a bare `name\t` line
 * and `get-url` answers its name, which is no address anyone configured. A
 * git-annex special remote is such a section. Lines may end in CRLF (Git for
 * Windows); a kept `\r` would match no line and read every remote as
 * URL-less. Anything after the URL-kind marker (Git 2.54+ appends the
 * partial-clone filter there as `[blob:none]`) is decoration about the
 * remote, never part of the URL, and is ignored whether or not its shape is
 * recognized.
 */
export function parseRemoteListing(names, listing) {
  const urls = new Map();
  for (const line of String(listing || '').split(/\r?\n/)) {
    const match = line.match(/^([^\t]+)\t(.*) \((fetch|push)\)/);
    if (!match) continue;
    const entry = urls.get(match[1]) ?? {};
    if (entry[match[3]] === undefined) entry[match[3]] = match[2];
    urls.set(match[1], entry);
  }
  return names.flatMap((name) => {
    const fetchUrl = urls.get(name)?.fetch;
    if (fetchUrl === undefined) return [];
    return [{ name, fetchUrl, pushUrl: urls.get(name)?.push ?? fetchUrl }];
  });
=======
export function parseRemoteListing(names: string[], listing: string) {
  const urls = new Map<string | undefined, Record<string, string | undefined>>();
  for (const line of String(listing || '').split(/\r?\n/)) {
    const match = line.match(/^([^\t]+)\t(.*) \((fetch|push)\)/);
    if (!match) continue;
    const entry = urls.get(match[1]) ?? {};
    if (entry[match[3] ?? ''] === undefined) entry[match[3] ?? ''] = match[2];
    urls.set(match[1], entry);
  }
  return names.flatMap((name) => {
    const fetchUrl = urls.get(name)?.fetch;
    if (fetchUrl === undefined) return [];
    return [{ name, fetchUrl, pushUrl: urls.get(name)?.push ?? fetchUrl }];
  });
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Each remote's fetch and push URL as `git remote get-url [--push]` reports
 * them (`insteadOf` rewrites applied), read with one `git remote -v` instead
 * of two Git processes per remote: repository identity is resolved several
 * times per Git operation, and a repository with many remotes spent most of
 * that time starting processes. A remote with no fetch URL is left out
 * (`parseRemoteListing`). When the listing itself fails, each remote is asked
 * on its own, so a failure never reads as URL-less remotes; there the
 * configured `remote.<name>.url` keys tell which remotes have a URL, because
 * `get-url` answers a URL-less remote's name.
 */
export async function getRepositoryRemoteUrls(directory) {
 const [namesResult, listResult] = await Promise.all([
  runGitCommand(directory, ['remote']),
  runGitCommand(directory, ['remote', '-v']),
 ]);
 if (!namesResult.success) return [];
 const names = String(namesResult.stdout || '').split(/\r?\n/).map((name) => name.trim()).filter(Boolean).sort();
 if (listResult.success) return parseRemoteListing(names, listResult.stdout);
 const configured = await runGitCommand(directory, ['config', '--name-only', '--get-regexp', '^remote\\..*\\.url$']);
 // Exit 1 is "no key matched"; any other failure keeps every remote.
 const withUrl = configured.success || configured.exitCode === 1
  ? new Set(String(configured.stdout || '').split(/\r?\n/).filter(Boolean).map((key) => key.slice('remote.'.length, -'.url'.length)))
  : null;
 return Promise.all(names.filter((name) => !withUrl || withUrl.has(name)).map(async (name) => {
  const [fetchResult, pushResult] = await Promise.all([
   runGitCommand(directory, ['remote', 'get-url', name]),
   runGitCommand(directory, ['remote', 'get-url', '--push', name]),
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Each remote's fetch and push URL as `git remote get-url [--push]` reports
 * them (`insteadOf` rewrites applied), read with one `git remote -v` instead
 * of two Git processes per remote: repository identity is resolved several
 * times per Git operation, and a repository with many remotes spent most of
 * that time starting processes. A remote with no fetch URL is left out
 * (`parseRemoteListing`). When the listing itself fails, each remote is asked
 * on its own, so a failure never reads as URL-less remotes; there the
 * configured `remote.<name>.url` keys tell which remotes have a URL, because
 * `get-url` answers a URL-less remote's name.
 */
export async function getRepositoryRemoteUrls(directory) {
  const [namesResult, listResult] = await Promise.all([
    runGitCommand(directory, ['remote']),
    runGitCommand(directory, ['remote', '-v']),
=======
export async function getRepositoryRemoteUrls(directory: string) {
  const [namesResult, listResult] = await Promise.all([
    runGitCommand(directory, ['remote']),
    runGitCommand(directory, ['remote', '-v']),
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  ]);
<<<<<<< HEAD:packages/web/server/lib/git/service.js
  const fetchUrl = fetchResult.success ? String(fetchResult.stdout || '').trim() : '';
  const pushUrl = pushResult.success ? String(pushResult.stdout || '').trim() : fetchUrl;
  return { name, fetchUrl, pushUrl };
 }));
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  if (!namesResult.success) return [];
  const names = String(namesResult.stdout || '').split(/\r?\n/).map((name) => name.trim()).filter(Boolean).sort();
  if (listResult.success) return parseRemoteListing(names, listResult.stdout);
  const configured = await runGitCommand(directory, ['config', '--name-only', '--get-regexp', '^remote\\..*\\.url$']);
  // Exit 1 is "no key matched"; any other failure keeps every remote.
  const withUrl = configured.success || configured.exitCode === 1
    ? new Set(String(configured.stdout || '').split(/\r?\n/).filter(Boolean).map((key) => key.slice('remote.'.length, -'.url'.length)))
    : null;
  return Promise.all(names.filter((name) => !withUrl || withUrl.has(name)).map(async (name) => {
    const [fetchResult, pushResult] = await Promise.all([
      runGitCommand(directory, ['remote', 'get-url', name]),
      runGitCommand(directory, ['remote', 'get-url', '--push', name]),
    ]);
    const fetchUrl = fetchResult.success ? String(fetchResult.stdout || '').trim() : '';
    const pushUrl = pushResult.success ? String(pushResult.stdout || '').trim() : fetchUrl;
    return { name, fetchUrl, pushUrl };
  }));
=======
  if (!namesResult.success) return [];
  const names = String(namesResult.stdout || '').split(/\r?\n/).map((name) => name.trim()).filter(Boolean).sort();
  if (listResult.success) return parseRemoteListing(names, listResult.stdout);
  const configured = await runGitCommand(directory, ['config', '--name-only', '--get-regexp', '^remote\\..*\\.url$']);
  const withUrl = configured.success || configured.exitCode === 1
    ? new Set(String(configured.stdout || '').split(/\r?\n/).filter(Boolean).map((key) => key.slice('remote.'.length, -'.url'.length)))
    : null;
  return Promise.all(names.filter((name) => !withUrl || withUrl.has(name)).map(async (name) => {
    const [fetchResult, pushResult] = await Promise.all([
      runGitCommand(directory, ['remote', 'get-url', name]),
      runGitCommand(directory, ['remote', 'get-url', '--push', name]),
    ]);
    const fetchUrl = fetchResult.success ? String(fetchResult.stdout || '').trim() : '';
    const pushUrl = pushResult.success ? String(pushResult.stdout || '').trim() : fetchUrl;
    return { name, fetchUrl, pushUrl };
  }));
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function resolveWorktreeTopLevel(directory) {
 const result = await runGitCommand(directory, ['rev-parse', '--show-toplevel', '--show-prefix']);
 if (!result.success) {
  // No `prefix`: a failed read must not look like "at the repository root".
  return { root: directory };
 }
 // Two lines: the checkout root, then where `directory` sits inside it
 // ("ai/", or an empty line at the root). Git resolves symlinks for both, so
 // the prefix stays right for a directory reached through one.
 const [rootLine = '', prefixLine = ''] = String(result.stdout || '').split('\n');
 const root = normalizePath(normalizeGitOutputPath(rootLine.trim()));
 return { root: root || directory, prefix: prefixLine.trim().replace(/\/+$/, '') };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function resolveWorktreeTopLevel(directory) {
  const result = await runGitCommand(directory, ['rev-parse', '--show-toplevel', '--show-prefix']);
  if (!result.success) {
    // No `prefix`: a failed read must not look like "at the repository root".
    return { root: directory };
  }
  // Two lines: the checkout root, then where `directory` sits inside it
  // ("ai/", or an empty line at the root). Git resolves symlinks for both, so
  // the prefix stays right for a directory reached through one.
  const [rootLine = '', prefixLine = ''] = String(result.stdout || '').split('\n');
  const root = normalizePath(normalizeGitOutputPath(rootLine.trim()));
  return { root: root || directory, prefix: prefixLine.trim().replace(/\/+$/, '') };
=======
export async function resolveWorktreeTopLevel(directory: string) {
  const result = await runGitCommand(directory, ['rev-parse', '--show-toplevel', '--show-prefix']);
  if (!result.success) {
    return { root: directory };
  }
  const [rootLine = '', prefixLine = ''] = String(result.stdout || '').split('\n');
  const root = normalizePath(normalizeGitOutputPath(rootLine.trim()));
  return { root: root || directory, prefix: prefixLine.trim().replace(/\/+$/, '') };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function getCommitSummaries(directory, shas) {
 const commits = Array.isArray(shas)
  ? shas.map((sha) => String(sha || '').trim()).filter(Boolean)
  : [];
 if (commits.length === 0) {
  return { commits: [] };
 }
 if (commits.some((sha) => !/^[0-9a-fA-F]{4,64}$/.test(sha))) {
  throw new Error('Invalid commit SHA');
 }
 const result = await runGitCommandOrThrow(
  directory,
  ['show', '-s', '--format=%H%x09%h%x09%s', ...commits, '--'],
  'Failed to get commit summaries'
 );
 const parsed = String(result.stdout || '')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
   const [sha, short, subject] = line.split('\t');
   return { sha: sha || '', short: short || '', subject: subject || '' };
  })
  .filter((entry) => entry.sha && entry.short);
 return { commits: parsed };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function getCommitSummaries(directory, shas) {
  const commits = Array.isArray(shas)
    ? shas.map((sha) => String(sha || '').trim()).filter(Boolean)
    : [];
  if (commits.length === 0) {
    return { commits: [] };
  }
  if (commits.some((sha) => !/^[0-9a-fA-F]{4,64}$/.test(sha))) {
    throw new Error('Invalid commit SHA');
  }
  const result = await runGitCommandOrThrow(
    directory,
    ['show', '-s', '--format=%H%x09%h%x09%s', ...commits, '--'],
    'Failed to get commit summaries'
  );
  const parsed = String(result.stdout || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [sha, short, subject] = line.split('\t');
      return { sha: sha || '', short: short || '', subject: subject || '' };
    })
    .filter((entry) => entry.sha && entry.short);
  return { commits: parsed };
=======
export async function getCommitSummaries<Shas>(directory: string, shas: Shas) {
  const commits = Array.isArray(shas)
    ? shas.map((sha) => String(sha || '').trim()).filter(Boolean)
    : [];
  if (commits.length === 0) {
    return { commits: [] };
  }
  if (commits.some((sha) => !/^[0-9a-fA-F]{4,64}$/.test(sha))) {
    throw new Error('Invalid commit SHA');
  }
  const result = await runGitCommandOrThrow(
    directory,
    ['show', '-s', '--format=%H%x09%h%x09%s', ...commits, '--'],
    'Failed to get commit summaries'
  );
  const parsed = String(result.stdout || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [sha, short, subject] = line.split('\t');
      return { sha: sha || '', short: short || '', subject: subject || '' };
    })
    .filter((entry) => entry.sha && entry.short);
  return { commits: parsed };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const trimGitLines = (value) => String(value || '')
 .split(/\r?\n/)
 .map((line) => line.trim())
 .filter(Boolean);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const trimGitLines = (value) => String(value || '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
=======
const trimGitLines = (value: string) => String(value || '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

const gitStdoutText = (result: GitCommandResult) => String(result?.stdout || '').trim();
const gitStderrText = (result: GitCommandResult) => String(result?.stderr || result?.message || '').trim();

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const normalizeIntegrateBranch = (value, fieldName) => {
 const branch = String(value || '').trim();
 if (!branch) {
  throw new Error(`${fieldName} is required`);
 }
 if (branch.startsWith('-') || branch.includes('\0')) {
  throw new Error(`Invalid ${fieldName}`);
 }
 return branch;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const normalizeIntegrateBranch = (value, fieldName) => {
  const branch = String(value || '').trim();
  if (!branch) {
    throw new Error(`${fieldName} is required`);
  }
  if (branch.startsWith('-') || branch.includes('\0')) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return branch;
=======
const normalizeIntegrateBranch = <Value>(value: Value, fieldName: string) => {
  const branch = String(value || '').trim();
  if (!branch) {
    throw new Error(`${fieldName} is required`);
  }
  if (branch.startsWith('-') || branch.includes('\0')) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return branch;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const normalizeIntegrateSha = (value) => {
 const sha = String(value || '').trim();
 if (!/^[0-9a-fA-F]{4,64}$/.test(sha)) {
  throw new Error('Invalid commit SHA');
 }
 return sha;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const normalizeIntegrateSha = (value) => {
  const sha = String(value || '').trim();
  if (!/^[0-9a-fA-F]{4,64}$/.test(sha)) {
    throw new Error('Invalid commit SHA');
  }
  return sha;
=======
const normalizeIntegrateSha = <Value>(value: Value) => {
  const sha = String(value || '').trim();
  if (!/^[0-9a-fA-F]{4,64}$/.test(sha)) {
    throw new Error('Invalid commit SHA');
  }
  return sha;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const normalizeIntegratePath = (value, fieldName) => {
 const target = normalizeDirectoryPath(value);
 if (!target) {
  throw new Error(`${fieldName} is required`);
 }
 return path.resolve(target);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const normalizeIntegratePath = (value, fieldName) => {
  const target = normalizeDirectoryPath(value);
  if (!target) {
    throw new Error(`${fieldName} is required`);
  }
  return path.resolve(target);
=======
const normalizeIntegratePath = <Value>(value: Value, fieldName: string) => {
  const target = value === undefined ? value : normalizeDirectoryPath(value);
  if (!target || !isPrimitiveString(target)) {
    throw new Error(`${fieldName} is required`);
  }
  return path.resolve(target);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

const runGitOk = (result: GitCommandResult) => Boolean(result?.success);

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const listGitWorktreesForIntegrate = async (repoRoot) => {
 const out = await runGitCommandOrThrow(repoRoot, ['worktree', 'list', '--porcelain'], 'Failed to list git worktrees');
 const entries = [];
 let current = null;
 for (const line of String(out.stdout || '').split(/\r?\n/)) {
  if (line.startsWith('worktree ')) {
   if (current) entries.push(current);
   current = { path: line.slice('worktree '.length).trim(), branchRef: null };
   continue;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const listGitWorktreesForIntegrate = async (repoRoot) => {
  const out = await runGitCommandOrThrow(repoRoot, ['worktree', 'list', '--porcelain'], 'Failed to list git worktrees');
  const entries = [];
  let current = null;
  for (const line of String(out.stdout || '').split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current);
      current = { path: line.slice('worktree '.length).trim(), branchRef: null };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('branch ')) {
      current.branchRef = line.slice('branch '.length).trim();
    }
=======
const listGitWorktreesForIntegrate = async (repoRoot: string) => {
  const out = await runGitCommandOrThrow(repoRoot, ['worktree', 'list', '--porcelain'], 'Failed to list git worktrees');
  const entries = [];
  let current: { path: string; branchRef: string | null } | null = null;
  for (const line of String(out.stdout || '').split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current);
      current = { path: line.slice('worktree '.length).trim(), branchRef: null };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('branch ')) {
      current.branchRef = line.slice('branch '.length).trim();
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  if (!current) continue;
  if (line.startsWith('branch ')) {
   current.branchRef = line.slice('branch '.length).trim();
  }
 }
 if (current) entries.push(current);
 return entries.filter((entry) => Boolean(entry.path));
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const ensureLocalIntegrateBranch = async (repoRoot, candidate) => {
 const raw = normalizeIntegrateBranch(candidate, 'targetBranch');
 if (raw === 'HEAD') {
  return 'HEAD';
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const ensureLocalIntegrateBranch = async (repoRoot, candidate) => {
  const raw = normalizeIntegrateBranch(candidate, 'targetBranch');
  if (raw === 'HEAD') {
    return 'HEAD';
  }

  const hasLocal = await runGitCommand(repoRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${raw}`]);
  if (runGitOk(hasLocal)) {
    return raw;
  }

  if (raw.startsWith('remotes/')) {
    const remoteRef = raw.slice('remotes/'.length);
    const parts = remoteRef.split('/');
    const remote = normalizeIntegrateBranch(parts[0] || 'origin', 'remote');
    const name = normalizeIntegrateBranch(parts.slice(1).join('/'), 'branch');
    await runGitCommandOrThrow(repoRoot, ['branch', '--track', name, `${remote}/${name}`], 'Failed to track remote branch');
    return name;
  }

  const remoteCheck = await runGitCommand(repoRoot, ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${raw}`]);
  if (runGitOk(remoteCheck)) {
    await runGitCommandOrThrow(repoRoot, ['branch', '--track', raw, `origin/${raw}`], 'Failed to track remote branch');
    return raw;
  }
=======
const ensureLocalIntegrateBranch = async (repoRoot: string, candidate: string) => {
  const raw = normalizeIntegrateBranch(candidate, 'targetBranch');
  if (raw === 'HEAD') {
    return 'HEAD';
  }

  const hasLocal = await runGitCommand(repoRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${raw}`]);
  if (runGitOk(hasLocal)) {
    return raw;
  }

  if (raw.startsWith('remotes/')) {
    const remoteRef = raw.slice('remotes/'.length);
    const parts = remoteRef.split('/');
    const remote = normalizeIntegrateBranch(parts[0] || 'origin', 'remote');
    const name = normalizeIntegrateBranch(parts.slice(1).join('/'), 'branch');
    await runGitCommandOrThrow(repoRoot, ['branch', '--track', name, `${remote}/${name}`], 'Failed to track remote branch');
    return name;
  }

  const remoteCheck = await runGitCommand(repoRoot, ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${raw}`]);
  if (runGitOk(remoteCheck)) {
    await runGitCommandOrThrow(repoRoot, ['branch', '--track', raw, `origin/${raw}`], 'Failed to track remote branch');
    return raw;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const hasLocal = await runGitCommand(repoRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${raw}`]);
 if (runGitOk(hasLocal)) {
  return raw;
 }

 if (raw.startsWith('remotes/')) {
  const remoteRef = raw.slice('remotes/'.length);
  const parts = remoteRef.split('/');
  const remote = normalizeIntegrateBranch(parts[0] || 'origin', 'remote');
  const name = normalizeIntegrateBranch(parts.slice(1).join('/'), 'branch');
  await runGitCommandOrThrow(repoRoot, ['branch', '--track', name, `${remote}/${name}`], 'Failed to track remote branch');
  return name;
 }

 const remoteCheck = await runGitCommand(repoRoot, ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${raw}`]);
 if (runGitOk(remoteCheck)) {
  await runGitCommandOrThrow(repoRoot, ['branch', '--track', raw, `origin/${raw}`], 'Failed to track remote branch');
  return raw;
 }

 return raw;
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function computeIntegratePlan(input = {}) {
 const repoRoot = normalizeIntegratePath(input.repoRoot, 'repoRoot');
 const sourceBranch = normalizeIntegrateBranch(input.sourceBranch, 'sourceBranch');
 const targetBranchRaw = normalizeIntegrateBranch(input.targetBranch, 'targetBranch');
 if (sourceBranch === 'HEAD' || targetBranchRaw === 'HEAD') {
  return { repoRoot, sourceBranch, targetBranch: targetBranchRaw, commits: [] };
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function computeIntegratePlan(input = {}) {
  const repoRoot = normalizeIntegratePath(input.repoRoot, 'repoRoot');
  const sourceBranch = normalizeIntegrateBranch(input.sourceBranch, 'sourceBranch');
  const targetBranchRaw = normalizeIntegrateBranch(input.targetBranch, 'targetBranch');
  if (sourceBranch === 'HEAD' || targetBranchRaw === 'HEAD') {
    return { repoRoot, sourceBranch, targetBranch: targetBranchRaw, commits: [] };
  }
=======
export async function computeIntegratePlan(input: IntegratePlanInput = {}) {
  const repoRoot = normalizeIntegratePath(input.repoRoot, 'repoRoot');
  const sourceBranch = normalizeIntegrateBranch(input.sourceBranch, 'sourceBranch');
  const targetBranchRaw = normalizeIntegrateBranch(input.targetBranch, 'targetBranch');
  if (sourceBranch === 'HEAD' || targetBranchRaw === 'HEAD') {
    return { repoRoot, sourceBranch, targetBranch: targetBranchRaw, commits: [] };
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const targetBranch = await ensureLocalIntegrateBranch(repoRoot, targetBranchRaw);
 const cherry = await runGitCommandOrThrow(repoRoot, ['cherry', targetBranch, sourceBranch], 'Failed to compute cherry commits');
 const plus = new Set();
 for (const line of trimGitLines(cherry.stdout)) {
  const match = line.match(/^\+\s+([0-9a-f]{7,40})\b/i);
  if (match) {
   plus.add(match[1]);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const targetBranch = await ensureLocalIntegrateBranch(repoRoot, targetBranchRaw);
  const cherry = await runGitCommandOrThrow(repoRoot, ['cherry', targetBranch, sourceBranch], 'Failed to compute cherry commits');
  const plus = new Set();
  for (const line of trimGitLines(cherry.stdout)) {
    const match = line.match(/^\+\s+([0-9a-f]{7,40})\b/i);
    if (match) {
      plus.add(match[1]);
    }
=======
  const targetBranch = await ensureLocalIntegrateBranch(repoRoot, targetBranchRaw);
  const cherry = await runGitCommandOrThrow(repoRoot, ['cherry', targetBranch, sourceBranch], 'Failed to compute cherry commits');
  const plus = new Set<string>();
  for (const line of trimGitLines(cherry.stdout)) {
    const match = line.match(/^\+\s+([0-9a-f]{7,40})\b/i);
    if (match) {
      plus.add(match[1] ?? '');
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 }

 const revList = await runGitCommandOrThrow(repoRoot, ['rev-list', '--reverse', `${targetBranch}..${sourceBranch}`], 'Failed to list commits');
 const commits = trimGitLines(revList.stdout).filter((sha) => plus.has(sha));
 return { repoRoot, sourceBranch, targetBranch, commits };
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const createIntegrateTempWorktree = async (repoRoot, targetBranch) => {
 const tmpParent = path.join(getOpenChamberDataPath(), 'tmp');
 await fsp.mkdir(tmpParent, { recursive: true });
 const tmpDir = await fsp.mkdtemp(path.join(tmpParent, 'oc-integrate-'));
 try {
  await runGitCommandOrThrow(repoRoot, ['worktree', 'add', '--force', tmpDir, targetBranch], 'Failed to create temp worktree');
  return tmpDir;
 } catch (error) {
  await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  throw error;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const createIntegrateTempWorktree = async (repoRoot, targetBranch) => {
  const tmpParent = path.join(os.homedir(), '.config', 'openchamber', 'tmp');
  await fsp.mkdir(tmpParent, { recursive: true });
  const tmpDir = await fsp.mkdtemp(path.join(tmpParent, 'oc-integrate-'));
  try {
    await runGitCommandOrThrow(repoRoot, ['worktree', 'add', '--force', tmpDir, targetBranch], 'Failed to create temp worktree');
    return tmpDir;
  } catch (error) {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
=======
const createIntegrateTempWorktree = async (repoRoot: string, targetBranch: string) => {
  const tmpParent = path.join(os.homedir(), '.config', 'openchamber', 'tmp');
  await fsp.mkdir(tmpParent, { recursive: true });
  const tmpDir = await fsp.mkdtemp(path.join(tmpParent, 'oc-integrate-'));
  try {
    await runGitCommandOrThrow(repoRoot, ['worktree', 'add', '--force', tmpDir, targetBranch], 'Failed to create temp worktree');
    return tmpDir;
  } catch (error) {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const removeIntegrateTempWorktree = async (repoRoot, tmpDir) => {
 await runGitCommand(repoRoot, ['worktree', 'remove', '--force', tmpDir]).catch(() => undefined);
 await runGitCommand(repoRoot, ['worktree', 'prune']).catch(() => undefined);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const removeIntegrateTempWorktree = async (repoRoot, tmpDir) => {
  await runGitCommand(repoRoot, ['worktree', 'remove', '--force', tmpDir]).catch(() => undefined);
  await runGitCommand(repoRoot, ['worktree', 'prune']).catch(() => undefined);
=======
const removeIntegrateTempWorktree = async (repoRoot: string, tmpDir: string) => {
  await runGitCommand(repoRoot, ['worktree', 'remove', '--force', tmpDir]).catch(() => undefined);
  await runGitCommand(repoRoot, ['worktree', 'prune']).catch(() => undefined);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const maybeFastForwardIntegrateUpstream = async (tmpDir) => {
 const upstream = await runGitCommand(tmpDir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
 const upstreamRef = gitStdoutText(upstream);
 if (!upstreamRef) {
  return;
 }
 const ff = await runGitCommand(tmpDir, ['merge', '--ff-only', upstreamRef]);
 if (!runGitOk(ff)) {
  throw new Error(gitStderrText(ff) || 'Fast-forward failed');
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const maybeFastForwardIntegrateUpstream = async (tmpDir) => {
  const upstream = await runGitCommand(tmpDir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const upstreamRef = gitStdoutText(upstream);
  if (!upstreamRef) {
    return;
  }
  const ff = await runGitCommand(tmpDir, ['merge', '--ff-only', upstreamRef]);
  if (!runGitOk(ff)) {
    throw new Error(gitStderrText(ff) || 'Fast-forward failed');
  }
=======
const maybeFastForwardIntegrateUpstream = async (tmpDir: string) => {
  const upstream = await runGitCommand(tmpDir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const upstreamRef = gitStdoutText(upstream);
  if (!upstreamRef) {
    return;
  }
  const ff = await runGitCommand(tmpDir, ['merge', '--ff-only', upstreamRef]);
  if (!runGitOk(ff)) {
    throw new Error(gitStderrText(ff) || 'Fast-forward failed');
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function getIntegrateConflictDetails(tmpDir) {
 const target = normalizeIntegratePath(tmpDir, 'tempWorktreePath');
 const [status, unmerged, diff, meta, patch] = await Promise.all([
  runGitCommand(target, ['status', '--porcelain']),
  runGitCommand(target, ['diff', '--name-only', '--diff-filter=U']),
  runGitCommand(target, ['diff', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/']),
  runGitCommand(target, ['show', '--no-patch', '--pretty=fuller', 'CHERRY_PICK_HEAD']),
  runGitCommand(target, ['show', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', 'CHERRY_PICK_HEAD']),
 ]);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function getIntegrateConflictDetails(tmpDir) {
  const target = normalizeIntegratePath(tmpDir, 'tempWorktreePath');
  const [status, unmerged, diff, meta, patch] = await Promise.all([
    runGitCommand(target, ['status', '--porcelain']),
    runGitCommand(target, ['diff', '--name-only', '--diff-filter=U']),
    runGitCommand(target, ['diff', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/']),
    runGitCommand(target, ['show', '--no-patch', '--pretty=fuller', 'CHERRY_PICK_HEAD']),
    runGitCommand(target, ['show', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', 'CHERRY_PICK_HEAD']),
  ]);
=======
export async function getIntegrateConflictDetails<Path>(tmpDir: Path) {
  const target = normalizeIntegratePath(tmpDir, 'tempWorktreePath');
  const [status, unmerged, diff, meta, patch] = await Promise.all([
    runGitCommand(target, ['status', '--porcelain']),
    runGitCommand(target, ['diff', '--name-only', '--diff-filter=U']),
    runGitCommand(target, ['diff', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/']),
    runGitCommand(target, ['show', '--no-patch', '--pretty=fuller', 'CHERRY_PICK_HEAD']),
    runGitCommand(target, ['show', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', 'CHERRY_PICK_HEAD']),
  ]);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 return {
  statusPorcelain: String(status.stdout || ''),
  unmergedFiles: trimGitLines(unmerged.stdout),
  diff: String(diff.stdout || diff.stderr || ''),
  currentPatchMeta: String(meta.stdout || meta.stderr || ''),
  currentPatch: String(patch.stdout || patch.stderr || ''),
 };
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function isCherryPickInProgress(tmpDir) {
 const target = normalizeIntegratePath(tmpDir, 'tempWorktreePath');
 const head = await runGitCommand(target, ['rev-parse', '--verify', '--quiet', 'CHERRY_PICK_HEAD']);
 return { inProgress: runGitOk(head) };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function isCherryPickInProgress(tmpDir) {
  const target = normalizeIntegratePath(tmpDir, 'tempWorktreePath');
  const head = await runGitCommand(target, ['rev-parse', '--verify', '--quiet', 'CHERRY_PICK_HEAD']);
  return { inProgress: runGitOk(head) };
=======
export async function isCherryPickInProgress<Path>(tmpDir: Path) {
  const target = normalizeIntegratePath(tmpDir, 'tempWorktreePath');
  const head = await runGitCommand(target, ['rev-parse', '--verify', '--quiet', 'CHERRY_PICK_HEAD']);
  return { inProgress: runGitOk(head) };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const computeCleanIntegrateWorktreesToSync = async ({ repoRoot, targetBranch, excludePaths }) => {
 const targetRef = `refs/heads/${targetBranch}`;
 const exclude = new Set(excludePaths);
 const entries = await listGitWorktreesForIntegrate(repoRoot);
 const candidates = entries
  .filter((entry) => entry.branchRef === targetRef)
  .map((entry) => entry.path)
  .filter((candidate) => candidate && !exclude.has(candidate));
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const computeCleanIntegrateWorktreesToSync = async ({ repoRoot, targetBranch, excludePaths }) => {
  const targetRef = `refs/heads/${targetBranch}`;
  const exclude = new Set(excludePaths);
  const entries = await listGitWorktreesForIntegrate(repoRoot);
  const candidates = entries
    .filter((entry) => entry.branchRef === targetRef)
    .map((entry) => entry.path)
    .filter((candidate) => candidate && !exclude.has(candidate));
=======
const computeCleanIntegrateWorktreesToSync = async ({ repoRoot, targetBranch, excludePaths }: { repoRoot: string; targetBranch: string; excludePaths: string[] }) => {
  const targetRef = `refs/heads/${targetBranch}`;
  const exclude = new Set(excludePaths);
  const entries = await listGitWorktreesForIntegrate(repoRoot);
  const candidates = entries
    .filter((entry) => entry.branchRef === targetRef)
    .map((entry) => entry.path)
    .filter((candidate) => candidate && !exclude.has(candidate));
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const clean = [];
 for (const candidate of candidates) {
  const status = await runGitCommand(candidate, ['status', '--porcelain']);
  if (!gitStdoutText(status)) {
   clean.push(candidate);
  }
 }
 return clean;
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const syncCleanIntegrateTargetWorktrees = async (paths) => {
 for (const target of paths) {
  await runGitCommand(target, ['reset', '--hard']).catch(() => undefined);
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const syncCleanIntegrateTargetWorktrees = async (paths) => {
  for (const target of paths) {
    await runGitCommand(target, ['reset', '--hard']).catch(() => undefined);
  }
=======
const syncCleanIntegrateTargetWorktrees = async (paths: string[]) => {
  for (const target of paths) {
    await runGitCommand(target, ['reset', '--hard']).catch(() => undefined);
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const normalizeIntegratePlan = async (plan = {}) => {
 const repoRoot = normalizeIntegratePath(plan.repoRoot, 'repoRoot');
 const sourceBranch = normalizeIntegrateBranch(plan.sourceBranch, 'sourceBranch');
 const targetBranch = normalizeIntegrateBranch(plan.targetBranch, 'targetBranch');
 const commits = Array.isArray(plan.commits) ? plan.commits.map(normalizeIntegrateSha) : [];
 return { repoRoot, sourceBranch, targetBranch, commits };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const normalizeIntegratePlan = async (plan = {}) => {
  const repoRoot = normalizeIntegratePath(plan.repoRoot, 'repoRoot');
  const sourceBranch = normalizeIntegrateBranch(plan.sourceBranch, 'sourceBranch');
  const targetBranch = normalizeIntegrateBranch(plan.targetBranch, 'targetBranch');
  const commits = Array.isArray(plan.commits) ? plan.commits.map(normalizeIntegrateSha) : [];
  return { repoRoot, sourceBranch, targetBranch, commits };
=======
const normalizeIntegratePlan = async (plan: IntegratePlanInput = {}) => {
  const repoRoot = normalizeIntegratePath(plan.repoRoot, 'repoRoot');
  const sourceBranch = normalizeIntegrateBranch(plan.sourceBranch, 'sourceBranch');
  const targetBranch = normalizeIntegrateBranch(plan.targetBranch, 'targetBranch');
  const commits = Array.isArray(plan.commits) ? plan.commits.map(normalizeIntegrateSha) : [];
  return { repoRoot, sourceBranch, targetBranch, commits };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const normalizeIntegrateState = (state = {}) => ({
 repoRoot: normalizeIntegratePath(state.repoRoot, 'repoRoot'),
 tempWorktreePath: normalizeIntegratePath(state.tempWorktreePath, 'tempWorktreePath'),
 sourceBranch: normalizeIntegrateBranch(state.sourceBranch, 'sourceBranch'),
 targetBranch: normalizeIntegrateBranch(state.targetBranch, 'targetBranch'),
 cleanTargetWorktrees: Array.isArray(state.cleanTargetWorktrees)
  ? state.cleanTargetWorktrees.map((entry) => normalizeIntegratePath(entry, 'cleanTargetWorktree'))
  : [],
 remainingCommits: Array.isArray(state.remainingCommits) ? state.remainingCommits.map(normalizeIntegrateSha) : [],
 currentCommit: normalizeIntegrateSha(state.currentCommit),
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const normalizeIntegrateState = (state = {}) => ({
  repoRoot: normalizeIntegratePath(state.repoRoot, 'repoRoot'),
  tempWorktreePath: normalizeIntegratePath(state.tempWorktreePath, 'tempWorktreePath'),
  sourceBranch: normalizeIntegrateBranch(state.sourceBranch, 'sourceBranch'),
  targetBranch: normalizeIntegrateBranch(state.targetBranch, 'targetBranch'),
  cleanTargetWorktrees: Array.isArray(state.cleanTargetWorktrees)
    ? state.cleanTargetWorktrees.map((entry) => normalizeIntegratePath(entry, 'cleanTargetWorktree'))
    : [],
  remainingCommits: Array.isArray(state.remainingCommits) ? state.remainingCommits.map(normalizeIntegrateSha) : [],
  currentCommit: normalizeIntegrateSha(state.currentCommit),
=======
const normalizeIntegrateState = (state: IntegrateStateInput = {}) => ({
  repoRoot: normalizeIntegratePath(state.repoRoot, 'repoRoot'),
  tempWorktreePath: normalizeIntegratePath(state.tempWorktreePath, 'tempWorktreePath'),
  sourceBranch: normalizeIntegrateBranch(state.sourceBranch, 'sourceBranch'),
  targetBranch: normalizeIntegrateBranch(state.targetBranch, 'targetBranch'),
  cleanTargetWorktrees: Array.isArray(state.cleanTargetWorktrees)
    ? state.cleanTargetWorktrees.map((entry) => normalizeIntegratePath(entry, 'cleanTargetWorktree'))
    : [],
  remainingCommits: Array.isArray(state.remainingCommits) ? state.remainingCommits.map(normalizeIntegrateSha) : [],
  currentCommit: normalizeIntegrateSha(state.currentCommit),
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
});

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function integrateWorktreeCommits(inputPlan = {}) {
 const plan = await normalizeIntegratePlan(inputPlan);
 if (plan.commits.length === 0) {
  return { kind: 'noop', reason: 'No commits to move' };
 }

 const tmpDir = await createIntegrateTempWorktree(plan.repoRoot, plan.targetBranch);
 let cleanTargetWorktrees = [];
 let remaining = [];
 try {
  await maybeFastForwardIntegrateUpstream(tmpDir);

  const clean = await runGitCommand(tmpDir, ['status', '--porcelain']);
  if (gitStdoutText(clean)) {
   throw new Error('Target branch has local changes; abort integration and retry');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function integrateWorktreeCommits(inputPlan = {}) {
  const plan = await normalizeIntegratePlan(inputPlan);
  if (plan.commits.length === 0) {
    return { kind: 'noop', reason: 'No commits to move' };
=======
export async function integrateWorktreeCommits(inputPlan: IntegratePlanInput = {}) {
  const plan = await normalizeIntegratePlan(inputPlan);
  if (plan.commits.length === 0) {
    return { kind: 'noop', reason: 'No commits to move' };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  cleanTargetWorktrees = await computeCleanIntegrateWorktreesToSync({
   repoRoot: plan.repoRoot,
   targetBranch: plan.targetBranch,
   excludePaths: [tmpDir],
  }).catch(() => []);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const tmpDir = await createIntegrateTempWorktree(plan.repoRoot, plan.targetBranch);
  let cleanTargetWorktrees = [];
  let remaining = [];
  try {
    await maybeFastForwardIntegrateUpstream(tmpDir);
=======
  const tmpDir = await createIntegrateTempWorktree(plan.repoRoot, plan.targetBranch);
  let cleanTargetWorktrees: string[] = [];
  let remaining: string[] = [];
  try {
    await maybeFastForwardIntegrateUpstream(tmpDir);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

  remaining = [...plan.commits];
  while (remaining.length > 0) {
   const sha = remaining[0];
   const pick = await runGitCommand(tmpDir, ['cherry-pick', sha]);
   if (runGitOk(pick)) {
    remaining.shift();
    continue;
   }

   const unmerged = await runGitCommand(tmpDir, ['diff', '--name-only', '--diff-filter=U']);
   const unmergedFiles = trimGitLines(unmerged.stdout);
   if (unmergedFiles.length > 0) {
    const details = await getIntegrateConflictDetails(tmpDir);
    return {
     kind: 'conflict',
     state: {
      repoRoot: plan.repoRoot,
      tempWorktreePath: tmpDir,
      sourceBranch: plan.sourceBranch,
      targetBranch: plan.targetBranch,
      cleanTargetWorktrees,
      remainingCommits: remaining,
      currentCommit: sha,
     },
     details,
    };
   }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
   throw new Error(gitStderrText(pick) || 'Cherry-pick failed');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    remaining = [...plan.commits];
    while (remaining.length > 0) {
      const sha = remaining[0];
      const pick = await runGitCommand(tmpDir, ['cherry-pick', sha]);
      if (runGitOk(pick)) {
        remaining.shift();
        continue;
      }

      const unmerged = await runGitCommand(tmpDir, ['diff', '--name-only', '--diff-filter=U']);
      const unmergedFiles = trimGitLines(unmerged.stdout);
      if (unmergedFiles.length > 0) {
        const details = await getIntegrateConflictDetails(tmpDir);
        return {
          kind: 'conflict',
          state: {
            repoRoot: plan.repoRoot,
            tempWorktreePath: tmpDir,
            sourceBranch: plan.sourceBranch,
            targetBranch: plan.targetBranch,
            cleanTargetWorktrees,
            remainingCommits: remaining,
            currentCommit: sha,
          },
          details,
        };
      }

      throw new Error(gitStderrText(pick) || 'Cherry-pick failed');
    }

    await removeIntegrateTempWorktree(plan.repoRoot, tmpDir);
    await syncCleanIntegrateTargetWorktrees(cleanTargetWorktrees).catch(() => undefined);
    return { kind: 'success', moved: plan.commits.length };
  } catch (error) {
    await removeIntegrateTempWorktree(plan.repoRoot, tmpDir).catch(() => undefined);
    throw error;
=======
    remaining = [...plan.commits];
    while (remaining.length > 0) {
      const sha = remaining[0] ?? '';
      const pick = await runGitCommand(tmpDir, ['cherry-pick', sha]);
      if (runGitOk(pick)) {
        remaining.shift();
        continue;
      }

      const unmerged = await runGitCommand(tmpDir, ['diff', '--name-only', '--diff-filter=U']);
      const unmergedFiles = trimGitLines(unmerged.stdout);
      if (unmergedFiles.length > 0) {
        const details = await getIntegrateConflictDetails(tmpDir);
        return {
          kind: 'conflict',
          state: {
            repoRoot: plan.repoRoot,
            tempWorktreePath: tmpDir,
            sourceBranch: plan.sourceBranch,
            targetBranch: plan.targetBranch,
            cleanTargetWorktrees,
            remainingCommits: remaining,
            currentCommit: sha,
          },
          details,
        };
      }

      throw new Error(gitStderrText(pick) || 'Cherry-pick failed');
    }

    await removeIntegrateTempWorktree(plan.repoRoot, tmpDir);
    await syncCleanIntegrateTargetWorktrees(cleanTargetWorktrees).catch(() => undefined);
    return { kind: 'success', moved: plan.commits.length };
  } catch (error) {
    await removeIntegrateTempWorktree(plan.repoRoot, tmpDir).catch(() => undefined);
    throw error;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

  await removeIntegrateTempWorktree(plan.repoRoot, tmpDir);
  await syncCleanIntegrateTargetWorktrees(cleanTargetWorktrees).catch(() => undefined);
  return { kind: 'success', moved: plan.commits.length };
 } catch (error) {
  await removeIntegrateTempWorktree(plan.repoRoot, tmpDir).catch(() => undefined);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function abortIntegrate(stateInput = {}) {
 const state = normalizeIntegrateState(stateInput);
 await runGitCommand(state.tempWorktreePath, ['cherry-pick', '--abort']).catch(() => undefined);
 await removeIntegrateTempWorktree(state.repoRoot, state.tempWorktreePath);
 return { success: true };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function abortIntegrate(stateInput = {}) {
  const state = normalizeIntegrateState(stateInput);
  await runGitCommand(state.tempWorktreePath, ['cherry-pick', '--abort']).catch(() => undefined);
  await removeIntegrateTempWorktree(state.repoRoot, state.tempWorktreePath);
  return { success: true };
=======
export async function abortIntegrate(stateInput: IntegrateStateInput = {}) {
  const state = normalizeIntegrateState(stateInput);
  await runGitCommand(state.tempWorktreePath, ['cherry-pick', '--abort']).catch(() => undefined);
  await removeIntegrateTempWorktree(state.repoRoot, state.tempWorktreePath);
  return { success: true };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function continueIntegrate(stateInput = {}) {
 const state = normalizeIntegrateState(stateInput);
 const cont = await runGitCommand(state.tempWorktreePath, ['cherry-pick', '--continue']);
 if (!runGitOk(cont)) {
  const unmerged = await runGitCommand(state.tempWorktreePath, ['diff', '--name-only', '--diff-filter=U']);
  if (trimGitLines(unmerged.stdout).length > 0) {
   const details = await getIntegrateConflictDetails(state.tempWorktreePath);
   return { kind: 'conflict', state, details };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function continueIntegrate(stateInput = {}) {
  const state = normalizeIntegrateState(stateInput);
  const cont = await runGitCommand(state.tempWorktreePath, ['cherry-pick', '--continue']);
  if (!runGitOk(cont)) {
    const unmerged = await runGitCommand(state.tempWorktreePath, ['diff', '--name-only', '--diff-filter=U']);
    if (trimGitLines(unmerged.stdout).length > 0) {
      const details = await getIntegrateConflictDetails(state.tempWorktreePath);
      return { kind: 'conflict', state, details };
    }
    throw new Error(gitStderrText(cont) || 'Cherry-pick continue failed');
=======
export async function continueIntegrate(stateInput: IntegrateStateInput = {}) {
  const state = normalizeIntegrateState(stateInput);
  const cont = await runGitCommand(state.tempWorktreePath, ['cherry-pick', '--continue']);
  if (!runGitOk(cont)) {
    const unmerged = await runGitCommand(state.tempWorktreePath, ['diff', '--name-only', '--diff-filter=U']);
    if (trimGitLines(unmerged.stdout).length > 0) {
      const details = await getIntegrateConflictDetails(state.tempWorktreePath);
      return { kind: 'conflict', state, details };
    }
    throw new Error(gitStderrText(cont) || 'Cherry-pick continue failed');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  throw new Error(gitStderrText(cont) || 'Cherry-pick continue failed');
 }

 const remaining = [...state.remainingCommits];
 if (remaining.length > 0 && remaining[0] === state.currentCommit) {
  remaining.shift();
 }

 const still = [...remaining];
 while (still.length > 0) {
  const sha = still[0];
  const pick = await runGitCommand(state.tempWorktreePath, ['cherry-pick', sha]);
  if (runGitOk(pick)) {
   still.shift();
   continue;
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
  const unmerged = await runGitCommand(state.tempWorktreePath, ['diff', '--name-only', '--diff-filter=U']);
  if (trimGitLines(unmerged.stdout).length > 0) {
   const details = await getIntegrateConflictDetails(state.tempWorktreePath);
   return {
    kind: 'conflict',
    state: {
     ...state,
     remainingCommits: still,
     currentCommit: sha,
    },
    details,
   };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js

  const still = [...remaining];
  while (still.length > 0) {
    const sha = still[0];
    const pick = await runGitCommand(state.tempWorktreePath, ['cherry-pick', sha]);
    if (runGitOk(pick)) {
      still.shift();
      continue;
    }
    const unmerged = await runGitCommand(state.tempWorktreePath, ['diff', '--name-only', '--diff-filter=U']);
    if (trimGitLines(unmerged.stdout).length > 0) {
      const details = await getIntegrateConflictDetails(state.tempWorktreePath);
      return {
        kind: 'conflict',
        state: {
          ...state,
          remainingCommits: still,
          currentCommit: sha,
        },
        details,
      };
    }
    throw new Error(gitStderrText(pick) || 'Cherry-pick failed');
=======

  const still = [...remaining];
  while (still.length > 0) {
    const sha = still[0] ?? '';
    const pick = await runGitCommand(state.tempWorktreePath, ['cherry-pick', sha]);
    if (runGitOk(pick)) {
      still.shift();
      continue;
    }
    const unmerged = await runGitCommand(state.tempWorktreePath, ['diff', '--name-only', '--diff-filter=U']);
    if (trimGitLines(unmerged.stdout).length > 0) {
      const details = await getIntegrateConflictDetails(state.tempWorktreePath);
      return {
        kind: 'conflict',
        state: {
          ...state,
          remainingCommits: still,
          currentCommit: sha,
        },
        details,
      };
    }
    throw new Error(gitStderrText(pick) || 'Cherry-pick failed');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  throw new Error(gitStderrText(pick) || 'Cherry-pick failed');
 }

 await removeIntegrateTempWorktree(state.repoRoot, state.tempWorktreePath);
 await syncCleanIntegrateTargetWorktrees(state.cleanTargetWorktrees).catch(() => undefined);
 return { kind: 'success', moved: state.remainingCommits.length };
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const ensureOpenCodeProjectId = async (primaryWorktree) => {
 const gitDir = path.join(primaryWorktree, '.git');
 const idFile = path.join(gitDir, 'opencode');
 const existing = await fsp.readFile(idFile, 'utf8').then((value) => value.trim()).catch(() => '');
 if (existing) {
  return existing;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const ensureOpenCodeProjectId = async (primaryWorktree) => {
  const gitDir = path.join(primaryWorktree, '.git');
  const idFile = path.join(gitDir, 'opencode');
  const existing = await fsp.readFile(idFile, 'utf8').then((value) => value.trim()).catch(() => '');
  if (existing) {
    return existing;
  }
=======
const ensureOpenCodeProjectId = async (primaryWorktree: string) => {
  const gitDir = path.join(primaryWorktree, '.git');
  const idFile = path.join(gitDir, 'opencode');
  const existing = await fsp.readFile(idFile, 'utf8').then((value) => value.trim()).catch(() => '');
  if (existing) {
    return existing;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const rootsResult = await runGitCommandOrThrow(
  primaryWorktree,
  ['rev-list', '--max-parents=0', '--all'],
  'Failed to resolve repository roots'
 );

 const roots = rootsResult.stdout
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b));

 const projectId = roots[0] || '';
 if (!projectId) {
  throw new Error('Failed to derive OpenCode project ID');
 }

 await fsp.mkdir(gitDir, { recursive: true }).catch(() => undefined);
 await fsp.writeFile(idFile, projectId, 'utf8').catch(() => undefined);

 return projectId;
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const resolveWorktreeProjectContext = async (directory, options = {}) => {
 const tolerateWorktreeRootConfigError = options?.tolerateWorktreeRootConfigError === true;
 const directoryPath = normalizeDirectoryPath(directory);
 if (!directoryPath) {
  throw new Error('Directory is required');
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const resolveWorktreeProjectContext = async (directory, options = {}) => {
  const tolerateWorktreeRootConfigError = options?.tolerateWorktreeRootConfigError === true;
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath) {
    throw new Error('Directory is required');
  }
=======
const resolveWorktreeProjectContext = async (directory: string, options: { tolerateWorktreeRootConfigError?: boolean } = {}) => {
  const tolerateWorktreeRootConfigError = options?.tolerateWorktreeRootConfigError === true;
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath) {
    throw new Error('Directory is required');
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const topResult = await runGitCommand(directoryPath, ['rev-parse', '--show-toplevel']);
 // A bare repository has no work tree, so `--show-toplevel` fails there; the
 // bare directory itself still answers the object-level commands worktree
 // creation runs against it.
 const sandbox = topResult.success
  ? path.resolve(directoryPath, normalizeGitOutputPath(topResult.stdout.trim()))
  : directoryPath;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const topResult = await runGitCommand(directoryPath, ['rev-parse', '--show-toplevel']);
  // A bare repository has no work tree, so `--show-toplevel` fails there; the
  // bare directory itself still answers the object-level commands worktree
  // creation runs against it.
  const sandbox = topResult.success
    ? path.resolve(directoryPath, normalizeGitOutputPath(topResult.stdout.trim()))
    : directoryPath;
=======
  const topResult = await runGitCommand(directoryPath, ['rev-parse', '--show-toplevel']);
  const sandbox = topResult.success
    ? path.resolve(directoryPath, normalizeGitOutputPath(topResult.stdout.trim()))
    : directoryPath;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const commonResult = await runGitCommandOrThrow(
  sandbox,
  ['rev-parse', '--git-common-dir'],
  'Failed to resolve git common directory'
 );
 const commonDir = path.resolve(sandbox, normalizeGitOutputPath(commonResult.stdout.trim()));
 // `<root>/.git` resolves to the primary checkout; any other layout (a bare
 // repository, a separate git dir) has no primary worktree, and the sandbox
 // directory is the closest thing to one.
 const primaryWorktree = derivePrimaryWorktreeRootFromGitDir(commonDir) || sandbox;
 const projectID = await ensureOpenCodeProjectId(primaryWorktree);
 // The personal project config is named by the canonical path-based id. The
 // Git metadata id above stays the key for the data-dir folder because it
 // follows the checkout when it is moved.
 const projectConfigID = createProjectIdFromPath(primaryWorktree);
 const defaultWorktreeRoot = path.join(getOpenChamberDataPath(), 'worktree', projectID);
 // Creation must not guess a folder the user did not choose, so a config read
 // failure propagates there. Read-only and removal paths pass
 // `tolerateWorktreeRootConfigError` and fall back to the data-dir root, so an
 // unreadable project config never blocks removing a worktree that already
 // exists.
 let configuredWorktreeRoot = null;
 try {
  if (projectWorktreeDirectoryReader) {
   configuredWorktreeRoot = resolveWorktreeDirectory(
    await projectWorktreeDirectoryReader(projectConfigID),
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const commonResult = await runGitCommandOrThrow(
    sandbox,
    ['rev-parse', '--git-common-dir'],
    'Failed to resolve git common directory'
  );
  const commonDir = path.resolve(sandbox, normalizeGitOutputPath(commonResult.stdout.trim()));
  // `<root>/.git` resolves to the primary checkout; any other layout (a bare
  // repository, a separate git dir) has no primary worktree, and the sandbox
  // directory is the closest thing to one.
  const primaryWorktree = derivePrimaryWorktreeRootFromGitDir(commonDir) || sandbox;
  const projectID = await ensureOpenCodeProjectId(primaryWorktree);
  // OpenCode's `worktree.directory` is read from the canonical checkout so a
  // linked worktree still sees the project's saved configuration. When unset,
  // worktrees keep landing in the data-dir folder keyed by project ID.
  const legacyWorktreeRoot = path.join(getOpenCodeDataPath(), 'worktree', projectID);
  // Creation must not guess a folder the user did not choose, so a config read
  // failure propagates there. Read-only and removal paths pass
  // `tolerateWorktreeRootConfigError` and fall back to the data-dir root, so an
  // unreadable config never blocks removing a worktree that already exists.
  let configuredWorktreeRoot = null;
  try {
    configuredWorktreeRoot = readWorktreeDirectorySetting(primaryWorktree);
  } catch (error) {
    if (!tolerateWorktreeRootConfigError) {
      throw error;
    }
    console.warn(
      'Failed to read OpenCode worktree.directory; using the data-dir worktree root:',
      error instanceof Error ? error.message : String(error),
    );
  }
  const worktreeRoot = configuredWorktreeRoot || legacyWorktreeRoot;

  return {
    projectID,
    requestedDirectory: directoryPath,
    sandbox,
=======
  const commonResult = await runGitCommandOrThrow(
    sandbox,
    ['rev-parse', '--git-common-dir'],
    'Failed to resolve git common directory'
  );
  const commonDir = path.resolve(sandbox, normalizeGitOutputPath(commonResult.stdout.trim()));
  const primaryWorktree = derivePrimaryWorktreeRootFromGitDir(commonDir) || sandbox;
  const projectID = await ensureOpenCodeProjectId(primaryWorktree);
  const legacyWorktreeRoot = path.join(getOpenCodeDataPath(), 'worktree', projectID);
  let configuredWorktreeRoot = null;
  try {
    configuredWorktreeRoot = readWorktreeDirectorySetting(primaryWorktree);
  } catch (error) {
    if (!tolerateWorktreeRootConfigError) {
      throw error;
    }
    console.warn(
      'Failed to read OpenCode worktree.directory; using the data-dir worktree root:',
      error instanceof Error ? error.message : String(error),
    );
  }
  const worktreeRoot = configuredWorktreeRoot || legacyWorktreeRoot;

  return {
    projectID,
    requestedDirectory: directoryPath,
    sandbox,
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    primaryWorktree,
   );
  }
 } catch (error) {
  if (!tolerateWorktreeRootConfigError) {
   throw error;
  }
  console.warn(
   'Failed to read the project worktreeDirectory setting; using the Host data-dir worktree root:',
   error instanceof Error ? error.message : String(error),
  );
 }
 const worktreeRoot = configuredWorktreeRoot || defaultWorktreeRoot;

 return {
  projectID,
  sandbox,
  primaryWorktree,
  worktreeRoot,
  defaultWorktreeRoot,
 };
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const listWorktreeEntries = async (directory) => {
 const rawResult = await runGitCommandOrThrow(
  directory,
  ['worktree', 'list', '--porcelain'],
  'Failed to list git worktrees'
 );
 return parseWorktreePorcelain(rawResult.stdout);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const listWorktreeEntries = async (directory) => {
  const rawResult = await runGitCommandOrThrow(
    directory,
    ['worktree', 'list', '--porcelain'],
    'Failed to list git worktrees'
  );
  return parseWorktreePorcelain(rawResult.stdout);
=======
const listWorktreeEntries = async (directory: string) => {
  const rawResult = await runGitCommandOrThrow(
    directory,
    ['worktree', 'list', '--porcelain'],
    'Failed to list git worktrees'
  );
  return parseWorktreePorcelain(rawResult.stdout);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const resolveWorktreeNameCandidates = (baseName) => {
 const normalizedBase = slugWorktreeName(baseName || '');
 if (!normalizedBase) {
  return Array.from({ length: OPENCODE_WORKTREE_ATTEMPTS }, () => generateOpenCodeRandomName());
 }
 return Array.from({ length: OPENCODE_WORKTREE_ATTEMPTS }, (_, index) => {
  if (index === 0) {
   return normalizedBase;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const resolveWorktreeNameCandidates = (baseName) => {
  const normalizedBase = slugWorktreeName(baseName || '');
  if (!normalizedBase) {
    return Array.from({ length: OPENCODE_WORKTREE_ATTEMPTS }, () => generateOpenCodeRandomName());
=======
const resolveWorktreeNameCandidates = (baseName: string) => {
  const normalizedBase = slugWorktreeName(baseName || '');
  if (!normalizedBase) {
    return Array.from({ length: OPENCODE_WORKTREE_ATTEMPTS }, () => generateOpenCodeRandomName());
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  return `${normalizedBase}-${generateOpenCodeRandomName()}`;
 });
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const resolveCandidateDirectory = async (worktreeRoot, preferredName, explicitBranchName, primaryWorktree) => {
 const candidates = resolveWorktreeNameCandidates(preferredName);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const resolveCandidateDirectory = async (worktreeRoot, preferredName, explicitBranchName, primaryWorktree) => {
  const candidates = resolveWorktreeNameCandidates(preferredName);
=======
const resolveCandidateDirectory = async (worktreeRoot: string, preferredName: string, explicitBranchName: string, primaryWorktree: string) => {
  const candidates = resolveWorktreeNameCandidates(preferredName);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 for (const name of candidates) {
  const directory = path.join(worktreeRoot, name);
  if (await checkPathExists(directory)) {
   continue;
  }

  if (explicitBranchName) {
   return { name, directory, branch: explicitBranchName };
  }

  const branch = `openchamber/${name}`;
  const branchRef = `refs/heads/${branch}`;
  const branchExists = await runGitCommand(primaryWorktree, ['show-ref', '--verify', '--quiet', branchRef]);
  if (branchExists.success) {
   continue;
  }

  return { name, directory, branch };
 }

 throw new Error('Failed to generate a unique worktree name');
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const resolveBranchForExistingMode = async (primaryWorktree, existingBranch, preferredBranchName) => {
 const requested = String(existingBranch || '').trim();
 if (!requested) {
  throw new Error('existingBranch is required in existing mode');
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const resolveBranchForExistingMode = async (primaryWorktree, existingBranch, preferredBranchName) => {
  const requested = String(existingBranch || '').trim();
  if (!requested) {
    throw new Error('existingBranch is required in existing mode');
  }

  const normalizedLocal = cleanBranchName(requested);
  const localRef = `refs/heads/${normalizedLocal}`;
  const localExists = await runGitCommand(primaryWorktree, ['show-ref', '--verify', '--quiet', localRef]);
  if (localExists.success) {
    return {
      localBranch: normalizedLocal,
      checkoutRef: normalizedLocal,
      createLocalBranch: false,
      remoteRef: null,
    };
  }

  const remoteRef = parseRemoteBranchRef(requested);
  if (!remoteRef) {
    throw new Error(`Branch not found: ${requested}`);
  }

  const remoteCheck = await ensureLocalRemoteBranchRef(primaryWorktree, remoteRef.remote, remoteRef.branch);
  if (!remoteCheck.found) {
    throw new Error(`Remote branch not found: ${requested}`);
  }

  const localBranch = cleanBranchName(preferredBranchName || remoteRef.branch || requested);
  if (!localBranch) {
    throw new Error('Failed to resolve local branch name for existing branch worktree');
  }
=======
const resolveBranchForExistingMode = async (primaryWorktree: string, existingBranch: string, preferredBranchName: string) => {
  const requested = String(existingBranch || '').trim();
  if (!requested) {
    throw new Error('existingBranch is required in existing mode');
  }

  const normalizedLocal = cleanBranchName(requested);
  const localRef = `refs/heads/${normalizedLocal}`;
  const localExists = await runGitCommand(primaryWorktree, ['show-ref', '--verify', '--quiet', localRef]);
  if (localExists.success) {
    return {
      localBranch: normalizedLocal,
      checkoutRef: normalizedLocal,
      createLocalBranch: false,
      remoteRef: null,
    };
  }

  const remoteRef = parseRemoteBranchRef(requested);
  if (!remoteRef) {
    throw new Error(`Branch not found: ${requested}`);
  }

  const remoteCheck = await ensureLocalRemoteBranchRef(primaryWorktree, remoteRef.remote, remoteRef.branch);
  if (!remoteCheck.found) {
    throw new Error(`Remote branch not found: ${requested}`);
  }

  const localBranch = cleanBranchName(preferredBranchName || remoteRef.branch || requested);
  if (!localBranch) {
    throw new Error('Failed to resolve local branch name for existing branch worktree');
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const normalizedLocal = cleanBranchName(requested);
 const localRef = `refs/heads/${normalizedLocal}`;
 const localExists = await runGitCommand(primaryWorktree, ['show-ref', '--verify', '--quiet', localRef]);
 if (localExists.success) {
  return {
   localBranch: normalizedLocal,
   checkoutRef: normalizedLocal,
   createLocalBranch: false,
   remoteRef: null,
  };
 }

 const remoteRef = parseRemoteBranchRef(requested);
 if (!remoteRef) {
  throw new Error(`Branch not found: ${requested}`);
 }

 const remoteExists = await runGitCommand(primaryWorktree, ['show-ref', '--verify', '--quiet', remoteRef.fullRef]);
 if (!remoteExists.success) {
  throw new Error(`Remote branch is not available locally: ${requested}. Fetch it explicitly and retry.`);
 }

 const localBranch = cleanBranchName(preferredBranchName || remoteRef.branch || requested);
 if (!localBranch) {
  throw new Error('Failed to resolve local branch name for existing branch worktree');
 }

 return {
  localBranch,
  checkoutRef: remoteRef.remoteRef,
  createLocalBranch: true,
  remoteRef,
 };
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const findBranchInUse = async (primaryWorktree, localBranchName) => {
 if (!localBranchName) {
  return null;
 }
 const entries = await listWorktreeEntries(primaryWorktree);
 const targetRef = `refs/heads/${localBranchName}`;
 const targetClean = cleanBranchName(targetRef);
 return entries.find((entry) => {
  const entryRef = String(entry.branchRef || '').trim();
  const entryClean = cleanBranchName(entryRef || entry.branch || '');
  return entryRef === targetRef || entryClean === targetClean;
 }) || null;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const findBranchInUse = async (primaryWorktree, localBranchName) => {
  if (!localBranchName) {
    return null;
  }
  const entries = await listWorktreeEntries(primaryWorktree);
  const targetRef = `refs/heads/${localBranchName}`;
  const targetClean = cleanBranchName(targetRef);
  return entries.find((entry) => {
    const entryRef = String(entry.branchRef || '').trim();
    const entryClean = cleanBranchName(entryRef || entry.branch || '');
    return entryRef === targetRef || entryClean === targetClean;
  }) || null;
=======
const findBranchInUse = async (primaryWorktree: string, localBranchName: string) => {
  if (!localBranchName) {
    return null;
  }
  const entries = await listWorktreeEntries(primaryWorktree);
  const targetRef = `refs/heads/${localBranchName}`;
  const targetClean = cleanBranchName(targetRef);
  return entries.find((entry) => {
    const entryRef = String(entry.branchRef || '').trim();
    const entryClean = cleanBranchName(entryRef || entry.branch || '');
    return entryRef === targetRef || entryClean === targetClean;
  }) || null;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Removing a worktree never deletes the repository's default branch or a
// branch another checkout holds. A worktree can end up on `main` (an agent's
// `git checkout -B main`), and deleting its branch would then delete main.
const isBranchKeptOnWorktreeRemoval = async (primaryWorktree, branchName) => {
 if (await findBranchInUse(primaryWorktree, branchName)) return true;
 const { git } = await createRepositoryGitContext(primaryWorktree);
 return Object.values(await getRemoteDefaultBranches(git)).includes(branchName);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Removing a worktree never deletes the repository's default branch or a
// branch another checkout holds. A worktree can end up on `main` (an agent's
// `git checkout -B main`), and deleting its branch would then delete main.
const isBranchKeptOnWorktreeRemoval = async (primaryWorktree, branchName) => {
  if (await findBranchInUse(primaryWorktree, branchName)) return true;
  const { git } = await createRepositoryGitContext(primaryWorktree);
  return Object.values(await getRemoteDefaultBranches(git)).includes(branchName);
=======
const isBranchKeptOnWorktreeRemoval = async (primaryWorktree: string, branchName: string) => {
  if (await findBranchInUse(primaryWorktree, branchName)) return true;
  const { git } = await createRepositoryGitContext(primaryWorktree);
  return Object.values(await getRemoteDefaultBranches(git)).includes(branchName);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const killWorktreeCommand = (child) => {
 if (process.platform === 'win32') {
  killProcessTree(child);
  return;
 }
 try {
  process.kill(-child.pid, 'SIGKILL');
 } catch {
  // Nothing is left in the group.
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const killWorktreeCommand = (child) => {
  if (process.platform === 'win32') {
    killProcessTree(child);
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // Nothing is left in the group.
  }
=======
const killWorktreeCommand = (child: ChildProcess) => {
  if (process.platform === 'win32') {
    killProcessTree(child);
    return;
  }
  try {
    process.kill(-Number(child.pid), 'SIGKILL');
  } catch {
    void 0;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// `timeoutMs` 0 means no limit. Stdin is closed: nobody can answer a prompt
// from these commands, and an open pipe would keep one waiting forever. Off
// Windows the command leads its own process group, so stopping it also stops
// what it started; `execFile` cannot start one.
const runWorktreeStartCommand = async (directory, command, { timeoutMs = 0, signal } = {}) => {
 const text = String(command || '').trim();
 if (!text) {
  return { success: true };
 }
 const env = await buildGitEnv(directory);
 if (signal?.aborted) {
  return { success: false, message: `${text} was cancelled` };
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// `timeoutMs` 0 means no limit. Stdin is closed: nobody can answer a prompt
// from these commands, and an open pipe would keep one waiting forever. Off
// Windows the command leads its own process group, so stopping it also stops
// what it started; `execFile` cannot start one.
const runWorktreeStartCommand = async (directory, command, { timeoutMs = 0, signal } = {}) => {
  const text = String(command || '').trim();
  if (!text) {
    return { success: true };
  }
  const env = await buildGitEnv(directory);
  if (signal?.aborted) {
    return { success: false, message: `${text} was cancelled` };
  }
=======
const runWorktreeStartCommand = async (directory: string, command: string | undefined, { timeoutMs = 0, signal, env: extraEnv }: StartCommandOptions = {}): Promise<StartCommandResult> => {
  const text = String(command || '').trim();
  if (!text) {
    return { success: true };
  }
  const env = { ...(await buildGitEnv(directory)), ...extraEnv };
  if (signal?.aborted) {
    return { success: false, message: `${text} was cancelled` };
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const windows = process.platform === 'win32';
 return new Promise((resolve) => {
  const child = spawn(windows ? 'cmd' : 'bash', windows ? ['/c', text] : ['-lc', text], {
   cwd: directory,
   env,
   windowsHide: true,
   detached: !windows,
   stdio: ['ignore', 'pipe', 'pipe'],
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const windows = process.platform === 'win32';
  return new Promise((resolve) => {
    const child = spawn(windows ? 'cmd' : 'bash', windows ? ['/c', text] : ['-lc', text], {
      cwd: directory,
      env,
      windowsHide: true,
      detached: !windows,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = { stdout: '', stderr: '' };
    let stopReason = null;
    const stop = (reason) => {
      stopReason ??= reason;
      killWorktreeCommand(child);
      // A process that left the group must not hold the result open by its pipes.
      child.stdout.destroy();
      child.stderr.destroy();
    };
    const collect = (stream) => {
      stream.setEncoding('utf8').on('data', (chunk) => {
        output[stream === child.stdout ? 'stdout' : 'stderr'] += chunk;
        if (output.stdout.length + output.stderr.length > WORKTREE_COMMAND_OUTPUT_MAX_CHARS) {
          stop(`${text} wrote too much output`);
        }
      });
    };
    collect(child.stdout);
    collect(child.stderr);

    const cancel = () => stop(`${text} was cancelled`);
    signal?.addEventListener('abort', cancel, { once: true });
    const timeout = timeoutMs > 0
      ? setTimeout(() => stop(`${text} did not finish within ${Math.round(timeoutMs / 1000)} seconds`), timeoutMs)
      : null;
    const finish = (result) => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
      resolve({ ...result, ...output });
    };
    child.once('error', (error) => finish({ success: false, message: parseGitErrorText(error) }));
    child.once('close', (code) => {
      if (stopReason) finish({ success: false, message: stopReason });
      else if (code === 0) finish({ success: true });
      else finish({ success: false, message: parseGitErrorText({ ...output, message: `Command failed: ${text}\n${output.stderr}` }) });
    });
=======
  const windows = process.platform === 'win32';
  return new Promise<StartCommandResult>((resolve) => {
    const child = spawn(windows ? 'cmd' : 'bash', windows ? ['/c', text] : ['-lc', text], {
      cwd: directory,
      env,
      windowsHide: true,
      detached: !windows,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = { stdout: '', stderr: '' };
    let stopReason: string | null = null;
    const stop = (reason: string) => {
      stopReason ??= reason;
      killWorktreeCommand(child);
      child.stdout.destroy();
      child.stderr.destroy();
    };
    const collect = (stream: Readable) => {
      stream.setEncoding('utf8').on('data', (chunk: string) => {
        output[stream === child.stdout ? 'stdout' : 'stderr'] += chunk;
        if (output.stdout.length + output.stderr.length > WORKTREE_COMMAND_OUTPUT_MAX_CHARS) {
          stop(`${text} wrote too much output`);
        }
      });
    };
    collect(child.stdout);
    collect(child.stderr);

    const cancel = () => stop(`${text} was cancelled`);
    signal?.addEventListener('abort', cancel, { once: true });
    const timeout = timeoutMs > 0
      ? setTimeout(() => stop(`${text} did not finish within ${Math.round(timeoutMs / 1000)} seconds`), timeoutMs)
      : null;
    const finish = (result: StartCommandResult) => {
      if (timeout !== null) clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
      resolve({ ...result, ...output });
    };
    child.once('error', (error) => finish({ success: false, message: parseGitErrorText(error) }));
    child.once('close', (code) => {
      if (stopReason) finish({ success: false, message: stopReason });
      else if (code === 0) finish({ success: true });
      else finish({ success: false, message: parseGitErrorText({ ...output, message: `Command failed: ${text}\n${output.stderr}` }) });
    });
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  });
  const output = { stdout: '', stderr: '' };
  let stopReason = null;
  const stop = (reason) => {
   stopReason ??= reason;
   killWorktreeCommand(child);
   // A process that left the group must not hold the result open by its pipes.
   child.stdout.destroy();
   child.stderr.destroy();
  };
  const collect = (stream) => {
   stream.setEncoding('utf8').on('data', (chunk) => {
    output[stream === child.stdout ? 'stdout' : 'stderr'] += chunk;
    if (output.stdout.length + output.stderr.length > WORKTREE_COMMAND_OUTPUT_MAX_CHARS) {
     stop(`${text} wrote too much output`);
    }
   });
  };
  collect(child.stdout);
  collect(child.stderr);

  const cancel = () => stop(`${text} was cancelled`);
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = timeoutMs > 0
   ? setTimeout(() => stop(`${text} did not finish within ${Math.round(timeoutMs / 1000)} seconds`), timeoutMs)
   : null;
  const finish = (result) => {
   clearTimeout(timeout);
   signal?.removeEventListener('abort', cancel);
   resolve({ ...result, ...output });
  };
  child.once('error', (error) => finish({ success: false, message: parseGitErrorText(error) }));
  child.once('close', (code) => {
   if (stopReason) finish({ success: false, message: stopReason });
   else if (code === 0) finish({ success: true });
   else finish({ success: false, message: parseGitErrorText({ ...output, message: `Command failed: ${text}\n${output.stderr}` }) });
  });
 });
};


<<<<<<< HEAD:packages/web/server/lib/git/service.js
const isAttachedGitWorktreeDirectory = async (directory) => {
 try {
  const result = await runGitCommand(directory, ['rev-parse', '--is-inside-work-tree']);
  return result.success && String(result.stdout || '').trim() === 'true';
 } catch {
  return false;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const isAttachedGitWorktreeDirectory = async (directory) => {
  try {
    const result = await runGitCommand(directory, ['rev-parse', '--is-inside-work-tree']);
    return result.success && String(result.stdout || '').trim() === 'true';
  } catch {
    return false;
  }
=======
const isAttachedGitWorktreeDirectory = async (directory: string) => {
  try {
    const result = await runGitCommand(directory, ['rev-parse', '--is-inside-work-tree']);
    return result.success && String(result.stdout || '').trim() === 'true';
  } catch {
    return false;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const cleanupFailedFastWorktreeCreate = async (context, candidate) => {
 const candidateDirectory = path.resolve(candidate.directory);
 const worktreeRoot = path.resolve(context.worktreeRoot);
 const isInsideWorktreeRoot = isInsideOrSameDirectory(worktreeRoot, candidateDirectory) && candidateDirectory !== worktreeRoot;
 const isAttached = await isAttachedGitWorktreeDirectory(candidateDirectory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const cleanupFailedFastWorktreeCreate = async (context, candidate) => {
  const candidateDirectory = path.resolve(candidate.directory);
  const worktreeRoot = path.resolve(context.worktreeRoot);
  const isInsideWorktreeRoot = isInsideOrSameDirectory(worktreeRoot, candidateDirectory) && candidateDirectory !== worktreeRoot;
  const isAttached = await isAttachedGitWorktreeDirectory(candidateDirectory);
=======
const cleanupFailedFastWorktreeCreate = async (context: WorktreeProjectContext, candidate: WorktreeCandidate, bootstrapStore?: BootstrapStore) => {
  const candidateDirectory = path.resolve(candidate.directory);
  const worktreeRoot = path.resolve(context.worktreeRoot);
  const isInsideWorktreeRoot = isInsideOrSameDirectory(worktreeRoot, candidateDirectory) && candidateDirectory !== worktreeRoot;
  const isAttached = await isAttachedGitWorktreeDirectory(candidateDirectory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 if (!isInsideWorktreeRoot || isAttached) {
  return;
 }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 try {
  const entries = await fsp.readdir(candidateDirectory);
  if (entries.length === 0) {
   await fsp.rmdir(candidateDirectory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  try {
    const entries = await fsp.readdir(candidateDirectory);
    if (entries.length === 0) {
      await fsp.rmdir(candidateDirectory);
    }
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error?.code)) {
      console.warn('Failed to clean up empty worktree directory after creation failure:', error instanceof Error ? error.message : String(error));
    }
=======
  const key = await toCanonicalBootstrapStateKey(candidateDirectory);
  let directoryGone = false;
  try {
    const entries = await fsp.readdir(candidateDirectory);
    if (entries.length === 0) {
      await fsp.rmdir(candidateDirectory);
      directoryGone = true;
    }
  } catch (error) {
    if (errorField(error, 'code') === 'ENOENT') {
      directoryGone = true;
    } else if (!['ENOTEMPTY', 'EEXIST'].some((code) => code === errorField(error, 'code'))) {
      console.warn('Failed to clean up empty worktree directory after creation failure:', error instanceof Error ? error.message : String(error));
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
 } catch (error) {
  if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error?.code)) {
   console.warn('Failed to clean up empty worktree directory after creation failure:', error instanceof Error ? error.message : String(error));
  }
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
=======
  if (!directoryGone) return;
  await releaseRolledBackAttemptFailure(key, bootstrapStore).catch((error) => {
    console.warn('Failed to release the bootstrap record of a rolled-back worktree:', error instanceof Error ? error.message : String(error));
  });
};

const WORKTREE_CREATE_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const WORKTREE_CREATE_COMMAND_OUTPUT_MAX_CHARS = 2000;
const WORKTREE_CREATE_COMMAND_FAILED = 'WORKTREE_CREATE_COMMAND_FAILED';

const createCommandFailure = (message: string) => Object.assign(new Error(message), { code: WORKTREE_CREATE_COMMAND_FAILED });

const shownCommandFailure = (result: StartCommandResult, maxChars: number) => {
  const message = String(result.message || '');
  const output = `${result.stderr || ''}\n${result.stdout || ''}`.trim();
  const text = (message.startsWith('Command failed:') || !message) && output
    ? output
    : message || 'the command exited with an error';
  return text.length > maxChars ? `...${text.slice(-maxChars)}` : text;
};

const createWorktreeWithCommand = async ({ primaryWorktree, directory, branch, branchStart, command }: { primaryWorktree: string; directory: string; branch: string; branchStart: BranchStart | null; command: string }) => {
  if (branchStart) {
    const branchArgs = ['branch'];
    if (branchStart.noTrack) branchArgs.push('--no-track');
    if (branchStart.force) branchArgs.push('-f');
    branchArgs.push(branch, branchStart.start);
    await runGitCommandOrThrow(primaryWorktree, branchArgs, 'Failed to create git worktree');
  }
  const failure = (message: string) => Object.assign(createCommandFailure(message), { branchMade: Boolean(branchStart) });
  const result = await runWorktreeStartCommand(primaryWorktree, command, {
    timeoutMs: WORKTREE_CREATE_COMMAND_TIMEOUT_MS,
    env: { WORKTREE_PATH: directory, WORKTREE_BRANCH: branch },
  });
  const found = await findWorktreeAtPath(primaryWorktree, directory);
  if (found) await markWorktreeCreatedByCommand(found.path, found.path === directory ? '' : directory);
  if (!result.success) {
    throw failure(`Worktree create command failed: ${shownCommandFailure(result, WORKTREE_CREATE_COMMAND_OUTPUT_MAX_CHARS)}`);
  }
  if (!found) {
    throw failure(`The worktree create command finished, but no worktree of this repository is at ${directory}. It must create one there on branch ${branch}.`);
  }
  if (found.entry.branchRef !== `refs/heads/${branch}`) {
    throw failure(`The worktree create command checked out ${found.entry.branch || 'a detached HEAD'} at ${directory}, not ${branch}`);
  }
  return found.path;
};

const findWorktreeAtPath = async (primaryWorktree: string, directory: string) => {
  const real = await fsp.realpath(directory).catch(() => null);
  if (!real) return null;
  const realCanonical = await canonicalPath(real);
  for (const entry of await listWorktreeEntries(primaryWorktree)) {
    if (entry?.worktree && await canonicalPath(entry.worktree) === realCanonical) return { path: real, entry };
  }
  return null;
};

const CREATED_BY_COMMAND_MARK = 'openchamber-created-by-command';

const worktreeCreatedByCommandMarkPath = async (worktreeDirectory: string) => {
  const gitDir = await runGitCommand(worktreeDirectory, ['rev-parse', '--absolute-git-dir']);
  return gitDir.success ? path.join(normalizeGitOutputPath(gitDir.stdout.trim()), CREATED_BY_COMMAND_MARK) : null;
};

const markWorktreeCreatedByCommand = async (worktreeDirectory: string, link: string) => {
  const markPath = await worktreeCreatedByCommandMarkPath(worktreeDirectory);
  if (!markPath) return;
  await fsp.writeFile(markPath, link).catch((error) => {
    console.warn('Failed to mark a worktree made by the create command:', error instanceof Error ? error.message : String(error));
  });
};

const readWorktreeCreatedByCommand = async (worktreeDirectory: string) => {
  const markPath = await worktreeCreatedByCommandMarkPath(worktreeDirectory).catch(() => null);
  if (!markPath) return null;
  const link = await fsp.readFile(markPath, 'utf8').catch(() => null);
  return link === null ? null : { link: link.trim() };
};

const samePathOf = async (input: string) => path.join(await canonicalPath(path.dirname(input)), path.basename(input));

const removeCreateCommandLink = async (link: string | undefined, worktreeDirectory: string) => {
  if (!link) return;
  try {
    if (!(await fsp.lstat(link)).isSymbolicLink()) return;
    const target = path.resolve(path.dirname(link), await fsp.readlink(link));
    if (await samePathOf(target) !== await samePathOf(worktreeDirectory)) return;
    await fsp.unlink(link);
  } catch (error) {
    if (errorField(error, 'code') !== 'ENOENT') {
      console.warn('Failed to remove the link the worktree create command left:', error instanceof Error ? error.message : String(error));
    }
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Git reads no stored project start command: the Host project setup API is the
// sole configured source, and it composes one explicit command per request.
const runWorktreeStartScripts = async (directory, startCommand, signal) => {
 const extraCommand = String(startCommand || '').trim();
 if (!extraCommand) {
  return;
 }
 const extraResult = await runWorktreeStartCommand(directory, extraCommand, { signal });
 if (!extraResult.success) {
  console.warn('Worktree start command failed:', extraResult.message || extraResult.stderr || extraResult.stdout);
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// `projectDirectory` is the directory the worktree was requested from: the user
// already works there, so OpenCode answers without starting another location.
const runWorktreeStartScripts = async (directory, projectDirectory, startCommand, signal) => {
  const projectStart = await readProjectStartCommand(projectDirectory);
  if (projectStart) {
    const projectResult = await runWorktreeStartCommand(directory, projectStart, { signal });
    if (!projectResult.success) {
      console.warn('Worktree project start command failed:', projectResult.message || projectResult.stderr || projectResult.stdout);
      return;
    }
  }

  const extraCommand = String(startCommand || '').trim();
  if (!extraCommand) {
    return;
  }
  const extraResult = await runWorktreeStartCommand(directory, extraCommand, { signal });
  if (!extraResult.success) {
    console.warn('Worktree start command failed:', extraResult.message || extraResult.stderr || extraResult.stdout);
  }
=======
const runWorktreeStartScripts = async (directory: string, projectDirectory: string, startCommand: string | undefined, signal: AbortSignal) => {
  const projectStart = await readProjectStartCommand(projectDirectory);
  if (projectStart) {
    const projectResult = await runWorktreeStartCommand(directory, projectStart, { signal });
    if (!projectResult.success) {
      console.warn('Worktree project start command failed:', projectResult.message || projectResult.stderr || projectResult.stdout);
      return;
    }
  }

  const extraCommand = String(startCommand || '').trim();
  if (!extraCommand) {
    return;
  }
  const extraResult = await runWorktreeStartCommand(directory, extraCommand, { signal });
  if (!extraResult.success) {
    console.warn('Worktree start command failed:', extraResult.message || extraResult.stderr || extraResult.stdout);
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const queueWorktreeBootstrap = (args) => {
 const {
  directory,
  primaryWorktree,
  localBranch,
  setUpstream,
  upstreamRemote,
  upstreamBranch,
  ensureRemoteName,
  ensureRemoteUrl,
  startCommand,
  contributorFork,
  hydrateCheckout,
  checkoutRemoteName,
  bootstrapStore,
 } = args;
 const setupKey = toBootstrapStateKey(directory);
 const setupCancellation = new AbortController();
 worktreeSetupCancellations.set(setupKey, setupCancellation);
 const task = new Promise((resolve) => setTimeout(resolve, 0))
  .then(async () => {
   await populateWorktreeWithLockRecovery(directory);
   const hydration = hydrateCheckout ? await hydrateCheckout({
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const queueWorktreeBootstrap = (args) => {
  const {
=======
const queueWorktreeBootstrap = (args: WorktreeBootstrapTask) => {
  const {
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    directory,
<<<<<<< HEAD:packages/web/server/lib/git/service.js
    parentRemoteName: checkoutRemoteName,
   }) : null;
   if (hydrateCheckout && !hydration) {
    throw new Error('Worktree checkout hydration returned no result');
   }
   if (hydration && !['succeeded', 'not-needed'].includes(hydration.status)) {
    const itemError = [...hydration.submodules, ...hydration.lfs]
     .find((item) => item.status === hydration.status)?.error;
    throw Object.assign(new Error(itemError?.message || 'Worktree checkout hydration did not complete'), {
     code: itemError?.code || 'TRANSPORT_FAILED', hydration,
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    projectDirectory,
    primaryWorktree,
    localBranch,
    setUpstream,
    upstreamRemote,
    upstreamBranch,
    ensureRemoteName,
    ensureRemoteUrl,
    startCommand,
    contributorFork,
    hydrateCheckout,
    checkoutRemoteName,
    bootstrapStore,
  } = args;
  const setupKey = toBootstrapStateKey(directory);
  const setupCancellation = new AbortController();
  worktreeSetupCancellations.set(setupKey, setupCancellation);
  const task = new Promise((resolve) => setTimeout(resolve, 0))
    .then(async () => {
      await populateWorktreeWithLockRecovery(directory);
      const hydration = hydrateCheckout ? await hydrateCheckout({
        directory,
        parentRemoteName: checkoutRemoteName,
      }) : null;
      if (hydrateCheckout && !hydration) {
        throw new Error('Worktree checkout hydration returned no result');
      }
      if (hydration && !['succeeded', 'not-needed'].includes(hydration.status)) {
        const itemError = [...hydration.submodules, ...hydration.lfs]
          .find((item) => item.status === hydration.status)?.error;
        throw Object.assign(new Error(itemError?.message || 'Worktree checkout hydration did not complete'), {
          code: itemError?.code || 'TRANSPORT_FAILED', hydration,
        });
      }
      if (setUpstream) {
        await applyUpstreamConfiguration({
          primaryWorktree,
          worktreeDirectory: directory,
          localBranch,
          setUpstream,
          upstreamRemote,
          upstreamBranch,
          ensureRemoteName,
          ensureRemoteUrl,
        }).catch((error) => {
          console.warn('Worktree upstream configuration failed:', error instanceof Error ? error.message : String(error));
        });
      }
      await setWorktreeBootstrapState(
        directory,
        WORKTREE_BOOTSTRAP_PENDING,
        WORKTREE_BOOTSTRAP_PHASE_GIT_READY,
        null,
        undefined,
        undefined,
        bootstrapStore,
      );
      if (!contributorFork) {
        await runWorktreeStartScripts(directory, projectDirectory, startCommand, setupCancellation.signal).catch((error) => {
          console.warn('Worktree start script task failed:', error instanceof Error ? error.message : String(error));
        });
      }
      await setWorktreeBootstrapState(
        directory,
        WORKTREE_BOOTSTRAP_READY,
        WORKTREE_BOOTSTRAP_PHASE_SETUP_READY,
        null,
        undefined,
        undefined,
        bootstrapStore,
      );
    })
    .catch(async (error) => {
      const recordedPhase = worktreeBootstrapState.get(await toCanonicalBootstrapStateKey(directory))?.phase;
      const pathLengthFailure = !error?.hydration
        && isFilenameTooLongError(error instanceof Error ? error.message : error);
      const publicMessage = error?.hydration
        ? error instanceof Error ? error.message : 'Worktree checkout hydration did not complete'
        : pathLengthFailure
          ? formatWorktreePopulateError(error instanceof Error ? error.message : error)
          : 'Worktree bootstrap failed. Inspect the checkout and repair it before use.';
      await setWorktreeBootstrapState(
        directory,
        WORKTREE_BOOTSTRAP_FAILED,
        recordedPhase === WORKTREE_BOOTSTRAP_PHASE_GIT_READY
          ? WORKTREE_BOOTSTRAP_PHASE_GIT_READY
          : WORKTREE_BOOTSTRAP_PHASE_DIRECTORY_CREATED,
        publicMessage,
        error?.hydration,
        bootstrapFailureCode(error, pathLengthFailure),
        bootstrapStore,
      ).catch(() => {});
      console.warn('Worktree bootstrap task failed:', error instanceof Error ? error.message : String(error));
=======
    projectDirectory,
    primaryWorktree,
    localBranch,
    setUpstream,
    upstreamRemote,
    upstreamBranch,
    ensureRemoteName,
    ensureRemoteUrl,
    startCommand,
    contributorFork,
    hydrateCheckout,
    checkoutRemoteName,
    bootstrapStore,
    populated,
  } = args;
  const setupKey = toBootstrapStateKey(directory);
  const setupCancellation = new AbortController();
  worktreeSetupCancellations.set(setupKey, setupCancellation);
  const task = new Promise<void>((resolve) => setTimeout(resolve, 0))
    .then(async () => {
      if (!populated) await populateWorktreeWithLockRecovery(directory);
      const hydration = hydrateCheckout ? await hydrateCheckout({
        directory,
        parentRemoteName: checkoutRemoteName,
      }) : null;
      if (hydrateCheckout && !hydration) {
        throw new Error('Worktree checkout hydration returned no result');
      }
      if (hydration && !['succeeded', 'not-needed'].includes(hydration.status)) {
        const itemError = [...hydration.submodules, ...hydration.lfs]
          .find((item) => item.status === hydration.status)?.error;
        throw Object.assign(new Error(itemError?.message || 'Worktree checkout hydration did not complete'), {
          code: itemError?.code || 'TRANSPORT_FAILED', hydration,
        });
      }
      if (setUpstream) {
        await applyUpstreamConfiguration({
          primaryWorktree,
          worktreeDirectory: directory,
          localBranch,
          setUpstream,
          upstreamRemote,
          upstreamBranch,
          ensureRemoteName,
          ensureRemoteUrl,
        }).catch((error) => {
          console.warn('Worktree upstream configuration failed:', error instanceof Error ? error.message : String(error));
        });
      }
      await setWorktreeBootstrapState(
        directory,
        WORKTREE_BOOTSTRAP_PENDING,
        WORKTREE_BOOTSTRAP_PHASE_GIT_READY,
        null,
        undefined,
        undefined,
        bootstrapStore,
      );
      if (!contributorFork) {
        await runWorktreeStartScripts(directory, projectDirectory, startCommand, setupCancellation.signal).catch((error) => {
          console.warn('Worktree start script task failed:', error instanceof Error ? error.message : String(error));
        });
      }
      await setWorktreeBootstrapState(
        directory,
        WORKTREE_BOOTSTRAP_READY,
        WORKTREE_BOOTSTRAP_PHASE_SETUP_READY,
        null,
        undefined,
        undefined,
        bootstrapStore,
      );
    })
    .catch(async <Failure>(error: Failure) => {
      const recordedPhase = worktreeBootstrapState.get(await toCanonicalBootstrapStateKey(directory))?.phase;
      const hydration = errorField(error, 'hydration');
      const pathLengthFailure = !hydration
        && isFilenameTooLongError(error instanceof Error ? error.message : error);
      const failureCode = bootstrapFailureCode(error, pathLengthFailure);
      const publicMessage = hydration
        ? error instanceof Error ? error.message : 'Worktree checkout hydration did not complete'
        : pathLengthFailure
          ? formatWorktreePopulateError(error instanceof Error ? error.message : error)
          : worktreeBootstrapFailureMessage(failureCode)
            ?? 'Worktree bootstrap failed. Inspect the checkout and repair it before use.';
      await setWorktreeBootstrapState(
        directory,
        WORKTREE_BOOTSTRAP_FAILED,
        recordedPhase === WORKTREE_BOOTSTRAP_PHASE_GIT_READY
          ? WORKTREE_BOOTSTRAP_PHASE_GIT_READY
          : WORKTREE_BOOTSTRAP_PHASE_DIRECTORY_CREATED,
        publicMessage,
        hydration,
        failureCode,
        bootstrapStore,
      ).catch(() => {});
      console.warn('Worktree bootstrap task failed:', error instanceof Error ? error.message : String(error));
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    });
   }
   if (setUpstream) {
    await applyUpstreamConfiguration({
     primaryWorktree,
     worktreeDirectory: directory,
     localBranch,
     setUpstream,
     upstreamRemote,
     upstreamBranch,
     ensureRemoteName,
     ensureRemoteUrl,
    }).catch((error) => {
     console.warn('Worktree upstream configuration failed:', error instanceof Error ? error.message : String(error));
    });
   }
   await setWorktreeBootstrapState(
    directory,
    WORKTREE_BOOTSTRAP_PENDING,
    WORKTREE_BOOTSTRAP_PHASE_GIT_READY,
    null,
    undefined,
    undefined,
    bootstrapStore,
   );
   if (!contributorFork) {
    await runWorktreeStartScripts(directory, startCommand, setupCancellation.signal).catch((error) => {
     console.warn('Worktree start script task failed:', error instanceof Error ? error.message : String(error));
    });
   }
   await setWorktreeBootstrapState(
    directory,
    WORKTREE_BOOTSTRAP_READY,
    WORKTREE_BOOTSTRAP_PHASE_SETUP_READY,
    null,
    undefined,
    undefined,
    bootstrapStore,
   );
  })
  .catch(async (error) => {
   const recordedPhase = worktreeBootstrapState.get(await toCanonicalBootstrapStateKey(directory))?.phase;
   const pathLengthFailure = !error?.hydration
    && isFilenameTooLongError(error instanceof Error ? error.message : error);
   const publicMessage = error?.hydration
    ? error instanceof Error ? error.message : 'Worktree checkout hydration did not complete'
    : pathLengthFailure
     ? formatWorktreePopulateError(error instanceof Error ? error.message : error)
     : 'Worktree bootstrap failed. Inspect the checkout and repair it before use.';
   await setWorktreeBootstrapState(
    directory,
    WORKTREE_BOOTSTRAP_FAILED,
    recordedPhase === WORKTREE_BOOTSTRAP_PHASE_GIT_READY
     ? WORKTREE_BOOTSTRAP_PHASE_GIT_READY
     : WORKTREE_BOOTSTRAP_PHASE_DIRECTORY_CREATED,
    publicMessage,
    error?.hydration,
    bootstrapFailureCode(error, pathLengthFailure),
    bootstrapStore,
   ).catch(() => { });
   console.warn('Worktree bootstrap task failed:', error instanceof Error ? error.message : String(error));
  });

 const forgetCancellation = () => worktreeSetupCancellations.delete(setupKey);
 void task.then(forgetCancellation, forgetCancellation);
 trackWorktreeBootstrapTask(directory, task);
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const withRemoteProvisioningQueue = async (primaryWorktree, remoteName, task) => {
 const key = `${path.resolve(primaryWorktree)}::${remoteName}`;
 const previous = remoteProvisioningQueues.get(key) || Promise.resolve();
 const current = previous.catch(() => { }).then(task);
 const tail = current.catch(() => { });
 remoteProvisioningQueues.set(key, tail);
 try {
  return await current;
 } finally {
  if (remoteProvisioningQueues.get(key) === tail) remoteProvisioningQueues.delete(key);
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const withRemoteProvisioningQueue = async (primaryWorktree, remoteName, task) => {
  const key = `${path.resolve(primaryWorktree)}::${remoteName}`;
  const previous = remoteProvisioningQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  const tail = current.catch(() => {});
  remoteProvisioningQueues.set(key, tail);
  try {
    return await current;
  } finally {
    if (remoteProvisioningQueues.get(key) === tail) remoteProvisioningQueues.delete(key);
  }
=======
const withRemoteProvisioningQueue = async <Result>(primaryWorktree: string, remoteName: string, task: () => Promise<Result>) => {
  const key = `${path.resolve(primaryWorktree)}::${remoteName}`;
  const previous = remoteProvisioningQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  const tail = current.catch(() => {});
  remoteProvisioningQueues.set(key, tail);
  try {
    return await current;
  } finally {
    if (remoteProvisioningQueues.get(key) === tail) remoteProvisioningQueues.delete(key);
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const ensureRemoteWithUrlUnlocked = async (primaryWorktree, remoteName, remoteUrl) => {
 const name = String(remoteName || '').trim();
 const url = String(remoteUrl || '').trim();
 if (!name || !url) {
  return;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const ensureRemoteWithUrlUnlocked = async (primaryWorktree, remoteName, remoteUrl) => {
  const name = String(remoteName || '').trim();
  const url = String(remoteUrl || '').trim();
  if (!name || !url) {
    return;
  }
=======
const ensureRemoteWithUrlUnlocked = async (primaryWorktree: string, remoteName: string, remoteUrl: string) => {
  const name = String(remoteName || '').trim();
  const url = String(remoteUrl || '').trim();
  if (!name || !url) {
    return;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const getUrl = await runGitCommand(primaryWorktree, ['remote', 'get-url', '--', name]);
 if (getUrl.success) {
  const currentUrl = String(getUrl.stdout || '').trim();
  if (currentUrl !== url) {
   const error = new Error(`Remote ${name} already exists with a different endpoint`);
   error.code = 'CONTRIBUTOR_REMOTE_COLLISION';
   error.status = 409;
   error.remoteName = name;
   throw error;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const getUrl = await runGitCommand(primaryWorktree, ['remote', 'get-url', '--', name]);
  if (getUrl.success) {
    const currentUrl = String(getUrl.stdout || '').trim();
    if (currentUrl !== url) {
      const error = new Error(`Remote ${name} already exists with a different endpoint`);
      error.code = 'CONTRIBUTOR_REMOTE_COLLISION';
      error.status = 409;
      error.remoteName = name;
      throw error;
    }
    return;
=======
  const getUrl = await runGitCommand(primaryWorktree, ['remote', 'get-url', '--', name]);
  if (getUrl.success) {
    const currentUrl = String(getUrl.stdout || '').trim();
    if (currentUrl !== url) {
      const error: Error & { code?: string; status?: number; remoteName?: string } = new Error(`Remote ${name} already exists with a different endpoint`);
      error.code = 'CONTRIBUTOR_REMOTE_COLLISION';
      error.status = 409;
      error.remoteName = name;
      throw error;
    }
    return;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  return;
 }

 await runGitCommandOrThrow(primaryWorktree, ['remote', 'add', '--', name, url], 'Failed to add git remote');
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const ensureRemoteWithUrl = (primaryWorktree, remoteName, remoteUrl) => withRemoteProvisioningQueue(
 primaryWorktree,
 remoteName,
 () => ensureRemoteWithUrlUnlocked(primaryWorktree, remoteName, remoteUrl)
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const ensureRemoteWithUrl = (primaryWorktree, remoteName, remoteUrl) => withRemoteProvisioningQueue(
  primaryWorktree,
  remoteName,
  () => ensureRemoteWithUrlUnlocked(primaryWorktree, remoteName, remoteUrl)
=======
const ensureRemoteWithUrl = (primaryWorktree: string, remoteName: string, remoteUrl: string) => withRemoteProvisioningQueue(
  primaryWorktree,
  remoteName,
  () => ensureRemoteWithUrlUnlocked(primaryWorktree, remoteName, remoteUrl)
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
);

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const captureRemoteUrl = async (primaryWorktree, remoteName) => {
 const result = await runGitCommand(primaryWorktree, ['remote', 'get-url', remoteName]);
 return result.success
  ? { exists: true, url: String(result.stdout || '').trim() }
  : { exists: false, url: '' };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const captureRemoteUrl = async (primaryWorktree, remoteName) => {
  const result = await runGitCommand(primaryWorktree, ['remote', 'get-url', remoteName]);
  return result.success
    ? { exists: true, url: String(result.stdout || '').trim() }
    : { exists: false, url: '' };
=======
const captureRemoteUrl = async (primaryWorktree: string, remoteName: string) => {
  const result = await runGitCommand(primaryWorktree, ['remote', 'get-url', remoteName]);
  return result.success
    ? { exists: true, url: String(result.stdout || '').trim() }
    : { exists: false, url: '' };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const restoreProvisionedRemote = async (primaryWorktree, remoteName, provisionedUrl, previous) => {
 const current = await captureRemoteUrl(primaryWorktree, remoteName);
 if (!current.exists) {
  if (!previous.exists) return;
  throw new Error(`Remote ${remoteName} changed during worktree creation`);
 }
 if (current.url !== provisionedUrl) {
  throw new Error(`Remote ${remoteName} changed during worktree creation`);
 }
 if (previous.exists) {
  return;
 }
 await runGitCommandOrThrow(primaryWorktree, ['remote', 'remove', '--', remoteName], 'Failed to remove provisioned git remote');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const restoreProvisionedRemote = async (primaryWorktree, remoteName, provisionedUrl, previous) => {
  const current = await captureRemoteUrl(primaryWorktree, remoteName);
  if (!current.exists) {
    if (!previous.exists) return;
    throw new Error(`Remote ${remoteName} changed during worktree creation`);
  }
  if (current.url !== provisionedUrl) {
    throw new Error(`Remote ${remoteName} changed during worktree creation`);
  }
  if (previous.exists) {
    return;
  }
  await runGitCommandOrThrow(primaryWorktree, ['remote', 'remove', '--', remoteName], 'Failed to remove provisioned git remote');
=======
const restoreProvisionedRemote = async (primaryWorktree: string, remoteName: string, provisionedUrl: string, previous: { exists: boolean; url: string }) => {
  const current = await captureRemoteUrl(primaryWorktree, remoteName);
  if (!current.exists) {
    if (!previous.exists) return;
    throw new Error(`Remote ${remoteName} changed during worktree creation`);
  }
  if (current.url !== provisionedUrl) {
    throw new Error(`Remote ${remoteName} changed during worktree creation`);
  }
  if (previous.exists) {
    return;
  }
  await runGitCommandOrThrow(primaryWorktree, ['remote', 'remove', '--', remoteName], 'Failed to remove provisioned git remote');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Shared existing-mode resolver for validate + create.
 * Provisioned remotes (`ensureRemoteName`/`ensureRemoteUrl`) are used for fork
 * PR heads; other existing branches keep the local / already-fetched remote path.
 *
 * @param {'validate'|'create'} intent
 */
const resolveExistingWorktreeSource = async (primaryWorktree, input = {}, intent = 'create') => {
 const preferredBranchName = cleanBranchName(String(input?.branchName || '').trim());
 const ensureRemoteName = String(input?.ensureRemoteName || '').trim();
 const ensureRemoteUrl = String(input?.ensureRemoteUrl || '').trim();
 const requestedExistingBranch = String(input?.existingBranch || '').trim();
 const wantUpstream = Boolean(input?.setUpstream);
 const explicitUpstreamRemote = String(input?.upstreamRemote || '').trim();
 const explicitUpstreamBranch = String(input?.upstreamBranch || '').trim();
 const expectedRevision = String(input?.expectedRevision || '').trim();
 const contributorTransferComplete = input?.contributorFork === true
  && input?.contributorTransferComplete === true;
 const parsedExistingRemote = await resolveRemoteBranchRef(primaryWorktree, requestedExistingBranch);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Shared existing-mode resolver for validate + create.
 * Provisioned remotes (`ensureRemoteName`/`ensureRemoteUrl`) are used for fork
 * PR heads; other existing branches keep the local / already-fetched remote path.
 *
 * @param {'validate'|'create'} intent
 */
const resolveExistingWorktreeSource = async (primaryWorktree, input = {}, intent = 'create') => {
  const preferredBranchName = cleanBranchName(String(input?.branchName || '').trim());
  const ensureRemoteName = String(input?.ensureRemoteName || '').trim();
  const ensureRemoteUrl = String(input?.ensureRemoteUrl || '').trim();
  const requestedExistingBranch = String(input?.existingBranch || '').trim();
  const wantUpstream = Boolean(input?.setUpstream);
  const explicitUpstreamRemote = String(input?.upstreamRemote || '').trim();
  const explicitUpstreamBranch = String(input?.upstreamBranch || '').trim();
  const expectedRevision = String(input?.expectedRevision || '').trim();
  const contributorTransferComplete = input?.contributorFork === true
    && input?.contributorTransferComplete === true;
  const parsedExistingRemote = await resolveRemoteBranchRef(primaryWorktree, requestedExistingBranch);
=======
const resolveExistingWorktreeSource = async (primaryWorktree: string, input: WorktreeCreateInput = {}, intent = 'create') => {
  const preferredBranchName = cleanBranchName(String(input?.branchName || '').trim());
  const ensureRemoteName = String(input?.ensureRemoteName || '').trim();
  const ensureRemoteUrl = String(input?.ensureRemoteUrl || '').trim();
  const requestedExistingBranch = String(input?.existingBranch || '').trim();
  const wantUpstream = Boolean(input?.setUpstream);
  const explicitUpstreamRemote = String(input?.upstreamRemote || '').trim();
  const explicitUpstreamBranch = String(input?.upstreamBranch || '').trim();
  const expectedRevision = String(input?.expectedRevision || '').trim();
  const contributorTransferComplete = input?.contributorFork === true
    && input?.contributorTransferComplete === true;
  const parsedExistingRemote = await resolveRemoteBranchRef(primaryWorktree, requestedExistingBranch);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 if (
  parsedExistingRemote
  && ensureRemoteName
  && ensureRemoteUrl
  && parsedExistingRemote.remote === ensureRemoteName
 ) {
  if (contributorTransferComplete) {
   if (intent === 'create') {
    await ensureRemoteWithUrlUnlocked(primaryWorktree, ensureRemoteName, ensureRemoteUrl);
   }
   const transferredRevision = await runGitCommand(
    primaryWorktree,
    ['rev-parse', '--verify', parsedExistingRemote.remoteRef]
   );
   if (!transferredRevision.success
    || (expectedRevision && String(transferredRevision.stdout || '').trim() !== expectedRevision)) {
    throw new Error('Transferred branch revision does not match the requested change request head');
   }
  } else {
   if (intent === 'create') {
    await ensureRemoteWithUrlUnlocked(primaryWorktree, ensureRemoteName, ensureRemoteUrl);
   }
   const localRevision = await runGitCommand(
    primaryWorktree,
    ['rev-parse', '--verify', parsedExistingRemote.remoteRef]
   );
   if (!localRevision.success) {
    throw new Error(`Remote branch is not available locally: ${parsedExistingRemote.remoteRef}. Transfer it explicitly and retry.`);
   }
   if (expectedRevision && String(localRevision.stdout || '').trim() !== expectedRevision) {
    throw new Error('Remote branch revision does not match the requested change request head');
   }
  }

  const localBranch = cleanBranchName(preferredBranchName || parsedExistingRemote.branch);
  return {
   localBranch,
   checkoutRef: parsedExistingRemote.remoteRef,
   createLocalBranch: true,
   setUpstream: wantUpstream,
   upstream: {
    remote: explicitUpstreamRemote || parsedExistingRemote.remote,
    branch: explicitUpstreamBranch || parsedExistingRemote.branch,
   },
  };
 }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 if (!requestedExistingBranch) {
  throw new Error('existingBranch is required in existing mode');
 }

 const resolved = await resolveBranchForExistingMode(
  primaryWorktree,
  requestedExistingBranch,
  preferredBranchName
 );
 if (expectedRevision) {
  const resolvedRevision = await runGitCommand(primaryWorktree, ['rev-parse', '--verify', resolved.checkoutRef]);
  if (!resolvedRevision.success || String(resolvedRevision.stdout || '').trim() !== expectedRevision) {
   throw new Error('Existing branch revision does not match the requested change request head');
  }
 }
 const upstream = resolved.remoteRef
  ? {
   remote: explicitUpstreamRemote || resolved.remoteRef.remote,
   branch: explicitUpstreamBranch || resolved.remoteRef.branch,
  }
  : (explicitUpstreamRemote && explicitUpstreamBranch
   ? { remote: explicitUpstreamRemote, branch: explicitUpstreamBranch }
   : null);

 return {
  localBranch: resolved.localBranch,
  checkoutRef: resolved.checkoutRef,
  createLocalBranch: resolved.createLocalBranch,
  setUpstream: wantUpstream && Boolean(upstream),
  upstream,
 };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// A live branch list offers remote branches that were never fetched (it asks
// each remote with `ls-remote`), so a worktree from one of them fetches that
// single branch first. A failed fetch reports the branch as missing.
const ensureLocalRemoteBranchRef = async (primaryWorktree, remoteName, branchName) => {
  const localCheck = await checkLocalRemoteBranchExists(primaryWorktree, remoteName, branchName);
  if (localCheck.found || !localCheck.success) return localCheck;
  await fetchRemoteBranchRef(primaryWorktree, remoteName, branchName).catch(() => undefined);
  return checkLocalRemoteBranchExists(primaryWorktree, remoteName, branchName);
=======
const ensureLocalRemoteBranchRef = async (primaryWorktree: string, remoteName: string, branchName: string) => {
  const localCheck = await checkLocalRemoteBranchExists(primaryWorktree, remoteName, branchName);
  if (localCheck.found || !localCheck.success) return localCheck;
  await fetchRemoteBranchRef(primaryWorktree, remoteName, branchName).catch(() => undefined);
  return checkLocalRemoteBranchExists(primaryWorktree, remoteName, branchName);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const checkLocalRemoteBranchExists = async (primaryWorktree, remoteName, branchName) => {
 const remote = String(remoteName || '').trim();
 const branch = String(branchName || '').trim();
 if (!remote || !branch) {
  return { success: false, found: false };
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const checkLocalRemoteBranchExists = async (primaryWorktree, remoteName, branchName) => {
  const remote = String(remoteName || '').trim();
  const branch = String(branchName || '').trim();
  if (!remote || !branch) {
    return { success: false, found: false };
  }
=======
const checkLocalRemoteBranchExists = async (primaryWorktree: string, remoteName: string, branchName: string) => {
  const remote = String(remoteName || '').trim();
  const branch = String(branchName || '').trim();
  if (!remote || !branch) {
    return { success: false, found: false };
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const localRef = await runGitCommand(
  primaryWorktree,
  ['show-ref', '--verify', '--quiet', `refs/remotes/${remote}/${branch}`]
 );
 return {
  success: true,
  found: localRef.success,
 };
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const applyUpstreamConfiguration = async (args) => {
 const {
  primaryWorktree,
  worktreeDirectory,
  localBranch,
  setUpstream,
  upstreamRemote,
  upstreamBranch,
  ensureRemoteName,
  ensureRemoteUrl,
 } = args;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const applyUpstreamConfiguration = async (args) => {
  const {
    primaryWorktree,
    worktreeDirectory,
    localBranch,
    setUpstream,
    upstreamRemote,
    upstreamBranch,
    ensureRemoteName,
    ensureRemoteUrl,
  } = args;
=======
const applyUpstreamConfiguration = async (args: UpstreamConfiguration) => {
  const {
    primaryWorktree,
    worktreeDirectory,
    localBranch,
    setUpstream,
    upstreamRemote,
    upstreamBranch,
    ensureRemoteName,
    ensureRemoteUrl,
  } = args;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 if (!setUpstream) {
  return;
 }

 if (ensureRemoteName && ensureRemoteUrl) {
  await ensureRemoteWithUrl(primaryWorktree, ensureRemoteName, ensureRemoteUrl);
 }

 const upstream = normalizeUpstreamTarget(upstreamRemote, upstreamBranch);
 if (!upstream || !localBranch) {
  return;
 }

 const upstreamRef = await runGitCommand(
  primaryWorktree,
  ['show-ref', '--verify', '--quiet', `refs/remotes/${upstream.remote}/${upstream.branch}`]
 );
 if (!upstreamRef.success) {
  return;
 }

 await runGitCommandOrThrow(
  worktreeDirectory,
  ['branch', `--set-upstream-to=${upstream.full}`, localBranch],
  `Failed to set upstream to ${upstream.full}`
 );
};

const warnedUnsupportedRoots = new Set<string>();

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** Initialize a normal project directory as a Git repository. */
export async function initializeRepository(directory) {
 const normalizedDirectory = normalizeDirectoryPath(directory);
 if (typeof normalizedDirectory !== 'string' || !normalizedDirectory.trim()) {
  throw Object.assign(new Error('directory is required'), { statusCode: 400 });
 }
 const directoryPath = path.resolve(normalizedDirectory);
 const rootReason = unsupportedRepositoryRootReason(directoryPath);
 if (rootReason === 'home') {
  throw Object.assign(new Error('Git is not initialized in the home directory: a repository there covers every file you own.'), { statusCode: 400 });
 }
 if (rootReason === 'filesystem-root') {
  throw Object.assign(new Error('Git is not initialized at the root of a disk.'), { statusCode: 400 });
 }
 await fsp.stat(directoryPath);
 const result = await runGitCommand(directoryPath, ['init']);
 if (!result.success) {
  throw Object.assign(new Error(result.message || 'Failed to initialize Git'), { statusCode: 500 });
 }
}


const toRepositoryRoot = (directoryPath, topLevel) => {
 const normalizedTopLevel = normalizeGitOutputPath(topLevel.trim());
 return path.isAbsolute(normalizedTopLevel)
  ? path.resolve(normalizedTopLevel)
  : path.resolve(directoryPath, normalizedTopLevel);
};

// What the user reads when Git could not tell whether a directory is a
// repository: Git's own words (a refused `safe.directory` names the command
// that fixes it), else why there were none.
const probeFailureMessage = (result) => {
 if (result.timedOut) return `Git did not answer within ${GIT_PROBE_TIMEOUT_MS / 1000} seconds.`;
 if (result.spawnFailed) return `Git could not be started: ${result.message}`;
 return result.stderr.trim() || result.message || 'Git could not read this directory.';
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// What the user reads when Git could not tell whether a directory is a
// repository: Git's own words (a refused `safe.directory` names the command
// that fixes it), else why there were none.
const probeFailureMessage = (result) => {
  if (result.timedOut) return `Git did not answer within ${GIT_PROBE_TIMEOUT_MS / 1000} seconds.`;
  if (result.spawnFailed) return `Git could not be started: ${result.message}`;
  return result.stderr.trim() || result.message || 'Git could not read this directory.';
=======
const probeFailureMessage = (result: GitCommandResult) => {
  if (result.timedOut) return `Git did not answer within ${GIT_PROBE_TIMEOUT_MS / 1000} seconds.`;
  if (result.spawnFailed) return `Git could not be started: ${result.message}`;
  return result.stderr.trim() || result.message || 'Git could not read this directory.';
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Whether `directoryPath` is in a supported repository, and where its working
// tree starts. One process answers both: in the desktop app every Git process
// is forked from the Electron main process, and a status read asks this first.
// `repoRoot` is null inside a bare repository or a .git directory, where Git
// prints the git dir and then fails on `--show-toplevel`; those still count
// as repositories.
//
// `failOnGitError`: a Git that could not answer (not spawnable, a refused
// `safe.directory`, a timeout) throws a `GIT_REPOSITORY_UNREADABLE` error with
// Git's own message instead of reading as "not a repository". A missing
// directory still reads as one. `strict` adds a throw for that too.
const probeRepository = async (directoryPath, { strict = false, failOnGitError = strict } = {}) => {
 const notRepository = { isRepository: false, repoRoot: null };
 if (!directoryPath || !fs.existsSync(directoryPath)) {
  if (strict) throw new Error('Project directory does not exist or is inaccessible');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Whether `directoryPath` is in a supported repository, and where its working
// tree starts. One process answers both: in the desktop app every Git process
// is forked from the Electron main process, and a status read asks this first.
// `repoRoot` is null inside a bare repository or a .git directory, where Git
// prints the git dir and then fails on `--show-toplevel`; those still count
// as repositories.
//
// `failOnGitError`: a Git that could not answer (not spawnable, a refused
// `safe.directory`, a timeout) throws a `GIT_REPOSITORY_UNREADABLE` error with
// Git's own message instead of reading as "not a repository". A missing
// directory still reads as one. `strict` adds a throw for that too.
const probeRepository = async (directoryPath, { strict = false, failOnGitError = strict } = {}) => {
  const notRepository = { isRepository: false, repoRoot: null };
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    if (strict) throw new Error('Project directory does not exist or is inaccessible');
    return notRepository;
  }

  const options = { timeoutMs: GIT_PROBE_TIMEOUT_MS };
  // English messages, so "not a git repository" is recognised whatever the locale.
  if (failOnGitError) options.env = { ...await buildGitEnv(directoryPath), LC_ALL: 'C' };
  const result = await runGitCommand(directoryPath, ['rev-parse', '--git-dir', '--show-toplevel'], options);
  const [gitDir = '', topLevel = ''] = result.stdout.split(/\r?\n/).map((line) => line.trim());
  if (failOnGitError && !result.success) {
    if (result.exitCode === 128 && !gitDir && /^fatal: not a git repository \(or any (?:of the parent directories\):|parent up to mount point [^\r\n]+\))/i.test(result.stderr.trim())) {
      return notRepository;
    }
    // Bare repositories and .git directories have a git dir but no work tree.
    if (!(gitDir && result.exitCode === 128 && /must be run in a work tree/i.test(result.stderr))) {
      throw Object.assign(new Error(probeFailureMessage(result)), { code: 'GIT_REPOSITORY_UNREADABLE' });
    }
  }
  if (!gitDir) return notRepository;
  if (!result.success) return { isRepository: true, repoRoot: null };

  const reason = unsupportedRepositoryRootReason(topLevel);
  if (!reason) {
    return { isRepository: true, repoRoot: topLevel ? toRepositoryRoot(directoryPath, topLevel) : null };
  }
  if (!warnedUnsupportedRoots.has(topLevel)) {
    warnedUnsupportedRoots.add(topLevel);
    console.warn(`[git] Ignoring repository rooted at ${topLevel} (${reason}): Git features are disabled for ${directoryPath}`);
  }
=======
const probeRepository = async (directoryPath: string, { strict = false, failOnGitError = strict }: { strict?: boolean; failOnGitError?: boolean } = {}) => {
  const notRepository = { isRepository: false, repoRoot: null };
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    if (strict) throw new Error('Project directory does not exist or is inaccessible');
    return notRepository;
  }

  const options: GitCommandOptions = { timeoutMs: GIT_PROBE_TIMEOUT_MS };
  if (failOnGitError) options.env = { ...await buildGitEnv(directoryPath), LC_ALL: 'C' };
  const result = await runGitCommand(directoryPath, ['rev-parse', '--git-dir', '--show-toplevel'], options);
  const [gitDir = '', topLevel = ''] = result.stdout.split(/\r?\n/).map((line) => line.trim());
  if (failOnGitError && !result.success) {
    if (result.exitCode === 128 && !gitDir && /^fatal: not a git repository \(or any (?:of the parent directories\):|parent up to mount point [^\r\n]+\))/i.test(result.stderr.trim())) {
      return notRepository;
    }
    if (!(gitDir && result.exitCode === 128 && /must be run in a work tree/i.test(result.stderr))) {
      throw Object.assign(new Error(probeFailureMessage(result)), { code: 'GIT_REPOSITORY_UNREADABLE' });
    }
  }
  if (!gitDir) return notRepository;
  if (!result.success) return { isRepository: true, repoRoot: null };

  const reason = unsupportedRepositoryRootReason(topLevel);
  if (!reason) {
    return { isRepository: true, repoRoot: topLevel ? toRepositoryRoot(directoryPath, topLevel) : null };
  }
  if (!warnedUnsupportedRoots.has(topLevel)) {
    warnedUnsupportedRoots.add(topLevel);
    console.warn(`[git] Ignoring repository rooted at ${topLevel} (${reason}): Git features are disabled for ${directoryPath}`);
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  return notRepository;
 }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const options = { timeoutMs: GIT_PROBE_TIMEOUT_MS };
 // English messages, so "not a git repository" is recognised whatever the locale.
 if (failOnGitError) options.env = { ...await buildGitEnv(directoryPath), LC_ALL: 'C' };
 const result = await runGitCommand(directoryPath, ['rev-parse', '--git-dir', '--show-toplevel'], options);
 const [gitDir = '', topLevel = ''] = result.stdout.split(/\r?\n/).map((line) => line.trim());
 if (failOnGitError && !result.success) {
  if (result.exitCode === 128 && !gitDir && /^fatal: not a git repository \(or any (?:of the parent directories\):|parent up to mount point [^\r\n]+\))/i.test(result.stderr.trim())) {
   return notRepository;
  }
  // Bare repositories and .git directories have a git dir but no work tree.
  if (!(gitDir && result.exitCode === 128 && /must be run in a work tree/i.test(result.stderr))) {
   throw Object.assign(new Error(probeFailureMessage(result)), { code: 'GIT_REPOSITORY_UNREADABLE' });
  }
 }
 if (!gitDir) return notRepository;
 if (!result.success) return { isRepository: true, repoRoot: null };

 const reason = unsupportedRepositoryRootReason(topLevel);
 if (!reason) {
  return { isRepository: true, repoRoot: topLevel ? toRepositoryRoot(directoryPath, topLevel) : null };
 }
 if (!warnedUnsupportedRoots.has(topLevel)) {
  warnedUnsupportedRoots.add(topLevel);
  console.warn(`[git] Ignoring repository rooted at ${topLevel} (${reason}): Git features are disabled for ${directoryPath}`);
 }
 return notRepository;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function isGitRepository(directory, options) {
  return (await probeRepository(normalizeDirectoryPath(directory), options)).isRepository;
=======
export async function isGitRepository(directory: string, options?: { strict?: boolean; failOnGitError?: boolean }) {
  return (await probeRepository(normalizeDirectoryPath(directory), options)).isRepository;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

export async function isGitRepository(directory, options) {
 return (await probeRepository(normalizeDirectoryPath(directory), options)).isRepository;
}

// Whether `directoryPath` holds a `.git` entry Git's discovery would have used.
// Discovery walks the parents and stops at the first filesystem boundary
// (`GIT_DISCOVERY_ACROSS_FILESYSTEM` unset), so the walk mirrors that. An
// unreadable ancestor answers `true`: not finding the entry proves nothing.
const hasGitDirectoryEntry = async (directoryPath) => {
 const hasEntry = async (entry) => {
  try { await fsp.lstat(entry); return true; }
  catch (error) {
   if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return false;
   throw error;
  }
 };
 try {
  let current = await fsp.realpath(path.resolve(directoryPath));
  const device = (await fsp.stat(current)).dev;
  for (; ;) {
   if (await hasEntry(path.join(current, '.git'))) return true;
   const parent = path.dirname(current);
   if (parent === current) return false;
   if ((await fsp.stat(parent)).dev !== device) return false;
   current = parent;
  }
 } catch {
  return true;
 }
};

/**
 * Whether Git found no repository at all for `directory`, as opposed to a
 * repository it could not read. Callers that answer a precondition (a folder
 * outside any repository) rather than a fault use this instead of matching
 * Git's diagnostic, which is translated and reworded between versions.
 *
 * Locale-independent by construction: the decision is Git's exit status plus
 * the entry discovery would have used, never the message. A `rev-parse` that
 * exits 128 without answering a git directory over no `.git` entry up to the
 * filesystem boundary means "no repository". The same exit with an entry present
 * is a repository Git refused to read (a refused `safe.directory`, a corrupt
 * config, a dangling gitfile), and every other failure (a timeout, Git that
 * could not start, a missing directory) is not this function's to claim: it
 * answers `false` so the caller keeps the error it already has.
 */
export const isOutsideGitRepository = async (directory) => {
 const directoryPath = String(normalizeDirectoryPath(directory) ?? '');
 if (!directoryPath.trim()) return false;
 const result = await runGitCommand(directoryPath, ['rev-parse', '--git-dir', '--show-toplevel'], { timeoutMs: GIT_PROBE_TIMEOUT_MS });
 if (result.success || result.exitCode !== 128) return false;
 // A bare repository or the `.git` directory itself exits 128 with
 // "must be run in a work tree" but does answer its git directory.
 if (result.stdout.trim()) return false;
 return !(await hasGitDirectoryEntry(directoryPath));
};

export async function getGlobalIdentity() {
 const git = await createGitForGlobalConfig();

 try {
  const userName = await git.getConfig('user.name', 'global').catch(() => null);
  const userEmail = await git.getConfig('user.email', 'global').catch(() => null);
  const sshCommand = await git.getConfig('core.sshCommand', 'global').catch(() => null);

  return {
   userName: userName?.value || null,
   userEmail: userEmail?.value || null,
   sshCommand: sshCommand?.value || null
  };
 } catch (error) {
  console.error('Failed to get global Git identity:', error);
  return {
   userName: null,
   userEmail: null,
   sshCommand: null
  };
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function getRemoteUrl(directory, remoteName = 'origin') {
 const git = await createGit(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function getRemoteUrl(directory, remoteName = 'origin') {
  const git = await createGit(directory);
=======
export async function getRemoteUrl(directory: string, remoteName = 'origin') {
  const git = await createGit(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 try {
  const url = await git.remote(['get-url', '--', remoteName]);
  return url?.trim() || null;
 } catch {
  return null;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function getCurrentIdentity(directory) {
 const git = await createGit(directory);
 // An unset key reads as a null value rather than an error, so the fallback
 // to the person's global configuration has to look at the value.
 const localOrGlobal = async (key) => {
  const local = await git.getConfig(key, 'local').catch(() => null);
  if (local?.value) return local.value;
  const global = await git.getConfig(key, 'global').catch(() => null);
  return global?.value || null;
 };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function getCurrentIdentity(directory) {
  const git = await createGit(directory);
  // An unset key reads as a null value rather than an error, so the fallback
  // to the person's global configuration has to look at the value.
  const localOrGlobal = async (key) => {
    const local = await git.getConfig(key, 'local').catch(() => null);
    if (local?.value) return local.value;
    const global = await git.getConfig(key, 'global').catch(() => null);
    return global?.value || null;
  };
=======
export async function getCurrentIdentity(directory: string) {
  const git = await createGit(directory);
  const localOrGlobal = async (key: string) => {
    const local = await git.getConfig(key, 'local').catch(() => null);
    if (local?.value) return local.value;
    const global = await git.getConfig(key, 'global').catch(() => null);
    return global?.value || null;
  };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 try {
  const [userName, userEmail, sshCommand] = await Promise.all([
   localOrGlobal('user.name'),
   localOrGlobal('user.email'),
   localOrGlobal('core.sshCommand'),
  ]);
  return { userName, userEmail, sshCommand };
 } catch (error) {
  console.error('Failed to get current Git identity:', error);
  return {
   userName: null,
   userEmail: null,
   sshCommand: null
  };
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function hasLocalIdentity(directory) {
 const git = await createGit(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function hasLocalIdentity(directory) {
  const git = await createGit(directory);
=======
export async function hasLocalIdentity(directory: string) {
  const git = await createGit(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 try {
  const localUserName = await git.getConfig('user.name', 'local').catch(() => null);
  const localUserEmail = await git.getConfig('user.email', 'local').catch(() => null);
  return Boolean(localUserName?.value?.trim() && localUserEmail?.value?.trim());
 } catch {
  return false;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Removes the identity a repository was given, leaving the machine's own.
 *
 * Choosing the system identity means no OpenChamber override applies here, so
 * the repository stops naming an author of its own and reads whatever the
 * machine's configuration says — including later changes to it. Only the keys
 * an identity writes are removed, and only in this repository.
 */
export async function clearLocalIdentity(directory) {
 const directoryPath = normalizeDirectoryPath(directory);
 // `git config --unset` exits 5 for a key that is not set, which is the
 // ordinary case here rather than a failure. Anything else (a locked
 // `.git/config`, a repository that is not one) means the author stayed.
 for (const key of ['user.name', 'user.email', 'user.signingkey', 'commit.gpgsign', 'gpg.format']) {
  const removed = await runGitCommand(directoryPath, ['config', '--local', '--unset-all', key]);
  if (!removed.success && removed.exitCode !== 5) {
   throw new Error(removed.stderr.trim() || `Failed to clear ${key}`);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Removes the identity a repository was given, leaving the machine's own.
 *
 * Choosing the system identity means no OpenChamber override applies here, so
 * the repository stops naming an author of its own and reads whatever the
 * machine's configuration says — including later changes to it. Only the keys
 * an identity writes are removed, and only in this repository.
 */
export async function clearLocalIdentity(directory) {
  const directoryPath = normalizeDirectoryPath(directory);
  // `git config --unset` exits 5 for a key that is not set, which is the
  // ordinary case here rather than a failure. Anything else (a locked
  // `.git/config`, a repository that is not one) means the author stayed.
  for (const key of ['user.name', 'user.email', 'user.signingkey', 'commit.gpgsign', 'gpg.format']) {
    const removed = await runGitCommand(directoryPath, ['config', '--local', '--unset-all', key]);
    if (!removed.success && removed.exitCode !== 5) {
      throw new Error(removed.stderr.trim() || `Failed to clear ${key}`);
    }
=======
export async function clearLocalIdentity(directory: string) {
  const directoryPath = normalizeDirectoryPath(directory);
  for (const key of ['user.name', 'user.email', 'user.signingkey', 'commit.gpgsign', 'gpg.format']) {
    const removed = await runGitCommand(directoryPath, ['config', '--local', '--unset-all', key]);
    if (!removed.success && removed.exitCode !== 5) {
      throw new Error(removed.stderr.trim() || `Failed to clear ${key}`);
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 }
 return true;
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function setLocalIdentity(directory, profile) {
 const git = await createGit(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function setLocalIdentity(directory, profile) {
  const git = await createGit(directory);
=======
export async function setLocalIdentity(directory: string, profile: { userName: string; userEmail: string; signCommits?: unknown; signingKey?: unknown }) {
  const git = await createGit(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 try {
  // Author profiles do not own transport configuration, including legacy auth fields.
  await git.addConfig('user.name', profile.userName, false, 'local');
  await git.addConfig('user.email', profile.userEmail, false, 'local');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  try {
    // Author profiles do not own transport configuration, including legacy auth fields.
    await git.addConfig('user.name', profile.userName, false, 'local');
    await git.addConfig('user.email', profile.userEmail, false, 'local');
=======
  try {
    await git.addConfig('user.name', profile.userName, false, 'local');
    await git.addConfig('user.email', profile.userEmail, false, 'local');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  if (profile.signCommits === true && typeof profile.signingKey === 'string' && profile.signingKey.trim()) {
   await git.addConfig('gpg.format', 'ssh', false, 'local');
   await git.addConfig('user.signingkey', profile.signingKey.trim(), false, 'local');
   await git.addConfig('commit.gpgsign', 'true', false, 'local');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    if (profile.signCommits === true && typeof profile.signingKey === 'string' && profile.signingKey.trim()) {
      await git.addConfig('gpg.format', 'ssh', false, 'local');
      await git.addConfig('user.signingkey', profile.signingKey.trim(), false, 'local');
      await git.addConfig('commit.gpgsign', 'true', false, 'local');
    }

    return true;
  } catch (error) {
    console.error('Failed to set Git identity:', error);
    throw error;
=======
    if (profile.signCommits === true && isPrimitiveString(profile.signingKey) && profile.signingKey.trim()) {
      await git.addConfig('gpg.format', 'ssh', false, 'local');
      await git.addConfig('user.signingkey', profile.signingKey.trim(), false, 'local');
      await git.addConfig('commit.gpgsign', 'true', false, 'local');
    }

    return true;
  } catch (error) {
    console.error('Failed to set Git identity:', error);
    throw error;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

  return true;
 } catch (error) {
  console.error('Failed to set Git identity:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * What a repository's own `.git/config` says about how it pushes and pulls.
 *
 * An identity with an account names OpenChamber's credential helper here, so
 * `git push` from any shell — the person's terminal, the agent's — acts as
 * that account; a managed key names the SSH wrapper with that key. Both are
 * written after an empty `credential.helper`, which is how Git is told that
 * the entries before it, the machine's own, do not apply to this repository.
 * Null for either removes what OpenChamber wrote and nothing else: a helper
 * the person configured themselves is not OpenChamber's to remove.
 */
export async function configureRepositoryTransport(directory, { credentialHelper = null, sshCommand = null } = {}) {
 const directoryPath = normalizeDirectoryPath(directory);
 if (typeof directoryPath !== 'string' || !directoryPath.trim()) throw new Error('Git directory is required');
 const config = (args) => runGitCommand(directoryPath, ['config', '--local', ...args]);
 const ourHelper = (value) => value.startsWith('!') && /git-credential-openchamber/.test(value);
 const helpers = await config(['--get-all', 'credential.helper']);
 if (!helpers.success && helpers.exitCode !== 1) throw new Error(helpers.stderr || 'Failed to read the repository credential helper');
 const current = helpers.success ? helpers.stdout.replace(/\n$/, '').split('\n') : [];
 // OpenChamber's entries are its helper and the empty reset written right
 // before it. Any other empty value is the person's own reset and stays.
 const others = [];
 for (const value of current) {
  if (!ourHelper(value)) { others.push(value); continue; }
  if (others.at(-1) === '') others.pop();
 }
 const wanted = credentialHelper ? [...others, '', credentialHelper] : others;
 if (JSON.stringify(current) !== JSON.stringify(wanted)) {
  // Identical values cannot be removed one by one, so the list is rewritten
  // in order: the person's entries as they were, then OpenChamber's.
  const removed = await config(['--unset-all', 'credential.helper']);
  if (!removed.success && removed.exitCode !== 5) throw new Error(removed.stderr || 'Failed to update the repository credential helper');
  for (const value of wanted) {
   const added = await config(['--add', 'credential.helper', value]);
   if (!added.success) throw new Error(added.stderr || 'Failed to write the repository credential helper');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * What a repository's own `.git/config` says about how it pushes and pulls.
 *
 * An identity with an account names OpenChamber's credential helper here, so
 * `git push` from any shell — the person's terminal, the agent's — acts as
 * that account; a managed key names the SSH wrapper with that key. Both are
 * written after an empty `credential.helper`, which is how Git is told that
 * the entries before it, the machine's own, do not apply to this repository.
 * Null for either removes what OpenChamber wrote and nothing else: a helper
 * the person configured themselves is not OpenChamber's to remove.
 */
export async function configureRepositoryTransport(directory, { credentialHelper = null, sshCommand = null } = {}) {
  const directoryPath = normalizeDirectoryPath(directory);
  if (typeof directoryPath !== 'string' || !directoryPath.trim()) throw new Error('Git directory is required');
  const config = (args) => runGitCommand(directoryPath, ['config', '--local', ...args]);
  const ourHelper = (value) => value.startsWith('!') && /git-credential-openchamber/.test(value);
  const helpers = await config(['--get-all', 'credential.helper']);
  if (!helpers.success && helpers.exitCode !== 1) throw new Error(helpers.stderr || 'Failed to read the repository credential helper');
  const current = helpers.success ? helpers.stdout.replace(/\n$/, '').split('\n') : [];
  // OpenChamber's entries are its helper and the empty reset written right
  // before it. Any other empty value is the person's own reset and stays.
  const others = [];
  for (const value of current) {
    if (!ourHelper(value)) { others.push(value); continue; }
    if (others.at(-1) === '') others.pop();
=======
export async function configureRepositoryTransport(directory: string, { credentialHelper = null, sshCommand = null }: { credentialHelper?: string | null; sshCommand?: string | null } = {}) {
  const directoryPath = normalizeDirectoryPath(directory);
  if (!isPrimitiveString(directoryPath) || !directoryPath.trim()) throw new Error('Git directory is required');
  const config = (args: string[]) => runGitCommand(directoryPath, ['config', '--local', ...args]);
  const ourHelper = (value: string) => value.startsWith('!') && /git-credential-openchamber/.test(value);
  const helpers = await config(['--get-all', 'credential.helper']);
  if (!helpers.success && helpers.exitCode !== 1) throw new Error(helpers.stderr || 'Failed to read the repository credential helper');
  const current = helpers.success ? helpers.stdout.replace(/\n$/, '').split('\n') : [];
  const others = [];
  for (const value of current) {
    if (!ourHelper(value)) { others.push(value); continue; }
    if (others.at(-1) === '') others.pop();
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
 }
 // The helper picks the grant by repository path, so an origin and a fork on
 // one host can answer as different accounts; Git sends the path only with
 // `credential.useHttpPath`. The person's own helpers never see it: inside
 // this repository the reset hides them, and the helper asks them from
 // outside it. A value the person set is theirs; the marker records ours.
 const ownedPathKey = 'openchamber.credentialusehttppath';
 const owned = (await config(['--get', ownedPathKey])).success;
 if (credentialHelper && !owned) {
  const existingPath = await config(['--get', 'credential.useHttpPath']);
  if (!existingPath.success && existingPath.exitCode !== 1) throw new Error(existingPath.stderr || 'Failed to read the repository credential settings');
  if (!existingPath.success) {
   for (const args of [['credential.useHttpPath', 'true'], [ownedPathKey, 'true']]) {
    const written = await config(args);
    if (!written.success) throw new Error(written.stderr || 'Failed to write the repository credential settings');
   }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const wanted = credentialHelper ? [...others, '', credentialHelper] : others;
  if (JSON.stringify(current) !== JSON.stringify(wanted)) {
    // Identical values cannot be removed one by one, so the list is rewritten
    // in order: the person's entries as they were, then OpenChamber's.
    const removed = await config(['--unset-all', 'credential.helper']);
    if (!removed.success && removed.exitCode !== 5) throw new Error(removed.stderr || 'Failed to update the repository credential helper');
    for (const value of wanted) {
      const added = await config(['--add', 'credential.helper', value]);
      if (!added.success) throw new Error(added.stderr || 'Failed to write the repository credential helper');
    }
=======
  const wanted = credentialHelper ? [...others, '', credentialHelper] : others;
  if (JSON.stringify(current) !== JSON.stringify(wanted)) {
    const removed = await config(['--unset-all', 'credential.helper']);
    if (!removed.success && removed.exitCode !== 5) throw new Error(removed.stderr || 'Failed to update the repository credential helper');
    for (const value of wanted) {
      const added = await config(['--add', 'credential.helper', value]);
      if (!added.success) throw new Error(added.stderr || 'Failed to write the repository credential helper');
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
 } else if (!credentialHelper && owned) {
  for (const key of ['credential.useHttpPath', ownedPathKey]) {
   const removed = await config(['--unset-all', key]);
   if (!removed.success && removed.exitCode !== 5) throw new Error(removed.stderr || 'Failed to remove the repository credential settings');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  // The helper picks the grant by repository path, so an origin and a fork on
  // one host can answer as different accounts; Git sends the path only with
  // `credential.useHttpPath`. The person's own helpers never see it: inside
  // this repository the reset hides them, and the helper asks them from
  // outside it. A value the person set is theirs; the marker records ours.
  const ownedPathKey = 'openchamber.credentialusehttppath';
  const owned = (await config(['--get', ownedPathKey])).success;
  if (credentialHelper && !owned) {
    const existingPath = await config(['--get', 'credential.useHttpPath']);
    if (!existingPath.success && existingPath.exitCode !== 1) throw new Error(existingPath.stderr || 'Failed to read the repository credential settings');
    if (!existingPath.success) {
      for (const args of [['credential.useHttpPath', 'true'], [ownedPathKey, 'true']]) {
        const written = await config(args);
        if (!written.success) throw new Error(written.stderr || 'Failed to write the repository credential settings');
      }
    }
  } else if (!credentialHelper && owned) {
    for (const key of ['credential.useHttpPath', ownedPathKey]) {
      const removed = await config(['--unset-all', key]);
      if (!removed.success && removed.exitCode !== 5) throw new Error(removed.stderr || 'Failed to remove the repository credential settings');
    }
=======
  const ownedPathKey = 'openchamber.credentialusehttppath';
  const owned = (await config(['--get', ownedPathKey])).success;
  if (credentialHelper && !owned) {
    const existingPath = await config(['--get', 'credential.useHttpPath']);
    if (!existingPath.success && existingPath.exitCode !== 1) throw new Error(existingPath.stderr || 'Failed to read the repository credential settings');
    if (!existingPath.success) {
      for (const args of [['credential.useHttpPath', 'true'], [ownedPathKey, 'true']]) {
        const written = await config(args);
        if (!written.success) throw new Error(written.stderr || 'Failed to write the repository credential settings');
      }
    }
  } else if (!credentialHelper && owned) {
    for (const key of ['credential.useHttpPath', ownedPathKey]) {
      const removed = await config(['--unset-all', key]);
      if (!removed.success && removed.exitCode !== 5) throw new Error(removed.stderr || 'Failed to remove the repository credential settings');
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 }
 const currentSsh = await config(['--get', 'core.sshCommand']);
 const existingSsh = currentSsh.success ? currentSsh.stdout.trim() : '';
 const oursSsh = /ssh-wrapper\.js/.test(existingSsh);
 if (sshCommand) {
  if (existingSsh !== sshCommand) {
   const written = await config(['core.sshCommand', sshCommand]);
   if (!written.success) throw new Error(written.stderr || 'Failed to write the repository SSH command');
  }
 } else if (oursSsh) {
  const removed = await config(['--unset', 'core.sshCommand']);
  if (!removed.success && removed.exitCode !== 5) throw new Error(removed.stderr || 'Failed to remove the repository SSH command');
 }
 return true;
}

const UNTRACKED_DIRECTORY_EXPANSION_LIMIT = 1000;

const GIT_STATUS_STALL_TIMEOUT_MS = 120_000;
const GIT_UNTRACKED_LISTING_STALL_TIMEOUT_MS = 60_000;
const GIT_PROBE_TIMEOUT_MS = 30_000;

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Untracked files under `dirPath` (repository-relative, trailing slash), read
// Git for Windows runs commands through a launcher: the `git.exe` we spawn is a
// wrapper whose child is the real `git`. Killing only the wrapper leaves that
// child alive, still walking the tree on its own (a repository rooted at a
// drive root sends it through Program Files), and it shows up in Task Manager
// as a stuck pair until someone ends it by hand. Windows has no process groups
// to signal, so the tree is ended through taskkill.
const killProcessTree = (child) => {
 if (!child.pid) return;
 if (process.platform === 'win32') {
  try {
   spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => { });
  } catch {
   child.kill('SIGKILL');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Untracked files under `dirPath` (repository-relative, trailing slash), read
// Git for Windows runs commands through a launcher: the `git.exe` we spawn is a
// wrapper whose child is the real `git`. Killing only the wrapper leaves that
// child alive, still walking the tree on its own (a repository rooted at a
// drive root sends it through Program Files), and it shows up in Task Manager
// as a stuck pair until someone ends it by hand. Windows has no process groups
// to signal, so the tree is ended through taskkill.
const killProcessTree = (child) => {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
    } catch {
      child.kill('SIGKILL');
    }
    return;
=======
const killProcessTree = (child: ChildProcess) => {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
    } catch {
      child.kill('SIGKILL');
    }
    return;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  return;
 }
 child.kill('SIGKILL');
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// from a streamed `ls-files` that is stopped once the bound is exceeded so a
// huge directory is never listed in full. `paths` is complete when
// `truncated` is false.
const listUntrackedFilesBounded = async (repoRoot, dirPath, limit) => {
 const env = await buildGitEnv(repoRoot);
 return new Promise((resolve, reject) => {
  const child = spawn(getGitBinary(), ['ls-files', '--others', '--exclude-standard', '-z', '--', dirPath], {
   cwd: repoRoot,
   env,
   windowsHide: true,
   stdio: ['ignore', 'pipe', 'ignore'],
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// from a streamed `ls-files` that is stopped once the bound is exceeded so a
// huge directory is never listed in full. `paths` is complete when
// `truncated` is false.
const listUntrackedFilesBounded = async (repoRoot, dirPath, limit) => {
  const env = await buildGitEnv(repoRoot);
  return new Promise((resolve, reject) => {
    const child = spawn(getGitBinary(), ['ls-files', '--others', '--exclude-standard', '-z', '--', dirPath], {
      cwd: repoRoot,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const paths = [];
    let pending = '';
    let truncated = false;
    let settled = false;
    let stallTimer = null;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (stallTimer) clearTimeout(stallTimer);
      if (error) {
        reject(error);
        return;
      }
      resolve({ paths, truncated });
    };
    // A listing that goes silent is killed rather than left holding the
    // status read (and its limiter slot) open.
    const armStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        killProcessTree(child);
        finish(new Error(`git ls-files produced no output for ${GIT_UNTRACKED_LISTING_STALL_TIMEOUT_MS}ms in ${dirPath}`));
      }, GIT_UNTRACKED_LISTING_STALL_TIMEOUT_MS);
    };
    armStallTimer();
    child.stdout.on('data', (chunk) => {
      armStallTimer();
      if (truncated) return;
      pending += chunk.toString('utf8');
      const records = pending.split('\0');
      pending = records.pop() ?? '';
      for (const record of records) {
        if (!record) continue;
        paths.push(record);
        if (paths.length > limit) {
          truncated = true;
          killProcessTree(child);
          finish();
          return;
        }
      }
    });
    child.on('error', (error) => finish(error));
    child.on('close', (code) => {
      if (truncated) {
        finish();
        return;
      }
      if (code !== 0) {
        finish(new Error(`git ls-files exited with code ${code} for ${dirPath}`));
        return;
      }
      if (pending) paths.push(pending);
      finish();
    });
=======
const listUntrackedFilesBounded = async (repoRoot: string, dirPath: string, limit: number) => {
  const env = await buildGitEnv(repoRoot);
  return new Promise<{ paths: string[]; truncated: boolean }>((resolve, reject) => {
    const child = spawn(getGitBinary(), ['ls-files', '--others', '--exclude-standard', '-z', '--', dirPath], {
      cwd: repoRoot,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const paths: string[] = [];
    let pending = '';
    let truncated = false;
    let settled = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (stallTimer) clearTimeout(stallTimer);
      if (error) {
        reject(error);
        return;
      }
      resolve({ paths, truncated });
    };
    const armStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        killProcessTree(child);
        finish(new Error(`git ls-files produced no output for ${GIT_UNTRACKED_LISTING_STALL_TIMEOUT_MS}ms in ${dirPath}`));
      }, GIT_UNTRACKED_LISTING_STALL_TIMEOUT_MS);
    };
    armStallTimer();
    child.stdout.on('data', (chunk) => {
      armStallTimer();
      if (truncated) return;
      pending += chunk.toString('utf8');
      const records = pending.split('\0');
      pending = records.pop() ?? '';
      for (const record of records) {
        if (!record) continue;
        paths.push(record);
        if (paths.length > limit) {
          truncated = true;
          killProcessTree(child);
          finish();
          return;
        }
      }
    });
    child.on('error', (error) => finish(error));
    child.on('close', (code) => {
      if (truncated) {
        finish();
        return;
      }
      if (code !== 0) {
        finish(new Error(`git ls-files exited with code ${code} for ${dirPath}`));
        return;
      }
      if (pending) paths.push(pending);
      finish();
    });
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  });
  const paths = [];
  let pending = '';
  let truncated = false;
  let settled = false;
  let stallTimer = null;
  const finish = (error) => {
   if (settled) return;
   settled = true;
   if (stallTimer) clearTimeout(stallTimer);
   if (error) {
    reject(error);
    return;
   }
   resolve({ paths, truncated });
  };
  // A listing that goes silent is killed rather than left holding the
  // status read (and its limiter slot) open.
  const armStallTimer = () => {
   if (stallTimer) clearTimeout(stallTimer);
   stallTimer = setTimeout(() => {
    killProcessTree(child);
    finish(new Error(`git ls-files produced no output for ${GIT_UNTRACKED_LISTING_STALL_TIMEOUT_MS}ms in ${dirPath}`));
   }, GIT_UNTRACKED_LISTING_STALL_TIMEOUT_MS);
  };
  armStallTimer();
  child.stdout.on('data', (chunk) => {
   armStallTimer();
   if (truncated) return;
   pending += chunk.toString('utf8');
   const records = pending.split('\0');
   pending = records.pop() ?? '';
   for (const record of records) {
    if (!record) continue;
    paths.push(record);
    if (paths.length > limit) {
     truncated = true;
     killProcessTree(child);
     finish();
     return;
    }
   }
  });
  child.on('error', (error) => finish(error));
  child.on('close', (code) => {
   if (truncated) {
    finish();
    return;
   }
   if (code !== 0) {
    finish(new Error(`git ls-files exited with code ${code} for ${dirPath}`));
    return;
   }
   if (pending) paths.push(pending);
   finish();
  });
 });
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Replaces each untracked `dir/` entry from `-unormal` with one entry per file
// inside it, the listing `-uall` would have produced, unless the directory
// holds more than the bound; then the `dir/` entry stays. A nested repository
// lists as itself and stays a `dir/` entry too, which is what the diff routes
// expect. A listing failure keeps the `dir/` entry rather than dropping the
// change from the status.
const expandUntrackedDirectories = async (repoRoot, files) => {
 const expanded = [];
 for (const file of files) {
  const isUntrackedDirectory = file.path.endsWith('/')
   && (file.working_dir || '').trim() === '?'
   && (file.index || '').trim() === '?';
  if (!isUntrackedDirectory) {
   expanded.push(file);
   continue;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Replaces each untracked `dir/` entry from `-unormal` with one entry per file
// inside it, the listing `-uall` would have produced, unless the directory
// holds more than the bound; then the `dir/` entry stays. A nested repository
// lists as itself and stays a `dir/` entry too, which is what the diff routes
// expect. A listing failure keeps the `dir/` entry rather than dropping the
// change from the status.
const expandUntrackedDirectories = async (repoRoot, files) => {
  const expanded = [];
  for (const file of files) {
    const isUntrackedDirectory = file.path.endsWith('/')
      && (file.working_dir || '').trim() === '?'
      && (file.index || '').trim() === '?';
    if (!isUntrackedDirectory) {
      expanded.push(file);
      continue;
    }
    const listing = await listUntrackedFilesBounded(repoRoot, file.path, UNTRACKED_DIRECTORY_EXPANSION_LIMIT)
      .catch((error) => {
        console.warn(`[GitService] Could not expand untracked directory ${file.path}:`, error?.message || error);
        return null;
      });
    if (!listing || listing.truncated || listing.paths.some((entry) => entry === file.path)) {
      expanded.push(file);
      continue;
    }
    for (const entryPath of listing.paths) {
      expanded.push({ ...file, path: entryPath });
    }
=======
const expandUntrackedDirectories = async (repoRoot: string, files: FileStatusResult[]) => {
  const expanded = [];
  for (const file of files) {
    const isUntrackedDirectory = file.path.endsWith('/')
      && (file.working_dir || '').trim() === '?'
      && (file.index || '').trim() === '?';
    if (!isUntrackedDirectory) {
      expanded.push(file);
      continue;
    }
    const listing = await listUntrackedFilesBounded(repoRoot, file.path, UNTRACKED_DIRECTORY_EXPANSION_LIMIT)
      .catch((error) => {
        console.warn(`[GitService] Could not expand untracked directory ${file.path}:`, error?.message || error);
        return null;
      });
    if (!listing || listing.truncated || listing.paths.some((entry) => entry === file.path)) {
      expanded.push(file);
      continue;
    }
    for (const entryPath of listing.paths) {
      expanded.push({ ...file, path: entryPath });
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  const listing = await listUntrackedFilesBounded(repoRoot, file.path, UNTRACKED_DIRECTORY_EXPANSION_LIMIT)
   .catch((error) => {
    console.warn(`[GitService] Could not expand untracked directory ${file.path}:`, error?.message || error);
    return null;
   });
  if (!listing || listing.truncated || listing.paths.some((entry) => entry === file.path)) {
   expanded.push(file);
   continue;
  }
  for (const entryPath of listing.paths) {
   expanded.push({ ...file, path: entryPath });
  }
 }
 return expanded;
};

const MAX_CONCURRENT_STATUS_READS = 4;
const statusRefresh = createSerialRefresh<{ lightMode: boolean }, Awaited<ReturnType<typeof readStatus>>>({ maxConcurrent: MAX_CONCURRENT_STATUS_READS });

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function getStatus(directory, options = {}) {
 const normalizedDirectory = normalizeDirectoryPath(directory);
 if (typeof normalizedDirectory !== 'string' || !normalizedDirectory.trim()) {
  throw new Error('directory is required');
 }
 const lightMode = options.mode === 'light';
 // A full read satisfies light callers too, so one run serves whichever
 // callers it answers, at the widest mode any of them asked for.
 return statusRefresh.run(
  normalizedDirectory,
  { lightMode },
  (requests) => readStatus(normalizedDirectory, requests.every((request) => request.lightMode)),
 );
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function getStatus(directory, options = {}) {
  const normalizedDirectory = normalizeDirectoryPath(directory);
  if (typeof normalizedDirectory !== 'string' || !normalizedDirectory.trim()) {
    throw new Error('directory is required');
  }
  const lightMode = options.mode === 'light';
  // A full read satisfies light callers too, so one run serves whichever
  // callers it answers, at the widest mode any of them asked for.
  return statusRefresh.run(
    normalizedDirectory,
    { lightMode },
    (requests) => readStatus(normalizedDirectory, requests.every((request) => request.lightMode)),
  );
=======
export async function getStatus(directory: string, options: { mode?: string | undefined } = {}) {
  const normalizedDirectory = normalizeDirectoryPath(directory);
  if (!isPrimitiveString(normalizedDirectory) || !normalizedDirectory.trim()) {
    throw new Error('directory is required');
  }
  const lightMode = options.mode === 'light';
  return statusRefresh.run(
    normalizedDirectory,
    { lightMode },
    (requests) => readStatus(normalizedDirectory, requests.every((request) => request.lightMode)),
  );
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Upstream of the checked-out branch as `remote/branch`, or `null` when HEAD
 * is detached, unborn, or the branch has no upstream configured. Reads refs
 * and config only, never the working tree: callers that only need the
 * tracking name must not pay for a status read.
 */
export async function getTrackingBranch(directory) {
 const normalizedDirectory = normalizeDirectoryPath(directory);
 if (!normalizedDirectory) {
  return null;
 }
 const head = await runGitCommand(normalizedDirectory, ['symbolic-ref', '--quiet', 'HEAD']);
 const headRef = head.success ? head.stdout.trim() : '';
 if (!headRef.startsWith('refs/heads/')) {
  return null;
 }
 const upstream = await runGitCommand(normalizedDirectory, ['for-each-ref', '--format=%(upstream:short)', headRef]);
 const tracking = upstream.success ? upstream.stdout.trim() : '';
 return tracking || null;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Upstream of the checked-out branch as `remote/branch`, or `null` when HEAD
 * is detached, unborn, or the branch has no upstream configured. Reads refs
 * and config only, never the working tree: callers that only need the
 * tracking name must not pay for a status read.
 */
export async function getTrackingBranch(directory) {
  const normalizedDirectory = normalizeDirectoryPath(directory);
  if (!normalizedDirectory) {
    return null;
  }
  const head = await runGitCommand(normalizedDirectory, ['symbolic-ref', '--quiet', 'HEAD']);
  const headRef = head.success ? head.stdout.trim() : '';
  if (!headRef.startsWith('refs/heads/')) {
    return null;
  }
  const upstream = await runGitCommand(normalizedDirectory, ['for-each-ref', '--format=%(upstream:short)', headRef]);
  const tracking = upstream.success ? upstream.stdout.trim() : '';
  return tracking || null;
=======
export async function getTrackingBranch(directory: string) {
  const normalizedDirectory = normalizeDirectoryPath(directory);
  if (!normalizedDirectory) {
    return null;
  }
  const head = await runGitCommand(normalizedDirectory, ['symbolic-ref', '--quiet', 'HEAD']);
  const headRef = head.success ? head.stdout.trim() : '';
  if (!headRef.startsWith('refs/heads/')) {
    return null;
  }
  const upstream = await runGitCommand(normalizedDirectory, ['for-each-ref', '--format=%(upstream:short)', headRef]);
  const tracking = upstream.success ? upstream.stdout.trim() : '';
  return tracking || null;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Short name of the checked-out branch, or `''` when HEAD is detached or the
 * directory is not a repository. Other Git failures throw. One ref read:
 * session knowledge calls it on every message a session sends.
 */
export async function getCheckedOutBranch(directory) {
 const normalizedDirectory = normalizeDirectoryPath(directory);
 if (!normalizedDirectory) {
  throw new Error('directory is required to read the checked-out branch');
 }
 const head = await runGitCommand(normalizedDirectory, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
 if (head.success) return head.stdout.trim();
 if ((head.exitCode === 1 && !head.stderr.trim()) || isNotGitRepositoryError(head.message)) return '';
 throw new Error(head.message || 'Failed to read the checked-out branch');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Short name of the checked-out branch, or '' when HEAD is detached or the
 * directory is not a repository. Other failures throw. Reads one ref on every
 * message a session sends.
 */
export async function getCheckedOutBranch(directory) {
  const normalizedDirectory = normalizeDirectoryPath(directory);
  if (!normalizedDirectory) {
    throw new Error('directory is required to read the checked-out branch');
  }
  const head = await runGitCommand(normalizedDirectory, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (head.success) return head.stdout.trim();
  if ((head.exitCode === 1 && !head.stderr.trim()) || isNotGitRepositoryError(head.message)) return '';
  throw new Error(head.message || 'Failed to read the checked-out branch');
=======
export async function getCheckedOutBranch(directory: string) {
  const normalizedDirectory = normalizeDirectoryPath(directory);
  if (!normalizedDirectory) {
    throw new Error('directory is required to read the checked-out branch');
  }
  const head = await runGitCommand(normalizedDirectory, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (head.success) return head.stdout.trim();
  if ((head.exitCode === 1 && !head.stderr.trim()) || isNotGitRepositoryError(head.message)) return '';
  throw new Error(head.message || 'Failed to read the checked-out branch');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function getPathsWithoutChanges(directory, paths) {
 const unchanged = [];
 for (const filePath of paths) {
  const status = await runGitCommand(directory, [
   '--literal-pathspecs', 'status', '--porcelain', '--untracked-files=all', '--', filePath,
  ]);
  if (!status.success || !status.stdout.trim()) unchanged.push(filePath);
 }
 return unchanged;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** Paths with no uncommitted change, including paths git cannot resolve. */
export async function getPathsWithoutChanges(directory, paths) {
  const unchanged = [];
  for (const filePath of paths) {
    const status = await runGitCommand(directory, [
      '--literal-pathspecs', 'status', '--porcelain', '--untracked-files=all', '--', filePath,
    ]);
    if (!status.success || !status.stdout.trim()) unchanged.push(filePath);
  }
  return unchanged;
=======
export async function getPathsWithoutChanges(directory: string, paths: string[]) {
  const unchanged = [];
  for (const filePath of paths) {
    const status = await runGitCommand(directory, [
      '--literal-pathspecs', 'status', '--porcelain', '--untracked-files=all', '--', filePath,
    ]);
    if (!status.success || !status.stdout.trim()) unchanged.push(filePath);
  }
  return unchanged;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Whether `sha` is reachable from the checked-out HEAD. An object git has never
// fetched fails the same way an unrelated commit does: not an ancestor.
export async function isAncestorOfHead(directory, sha) {
 const normalizedDirectory = normalizeDirectoryPath(directory);
 const normalizedSha = typeof sha === 'string' ? sha.trim() : '';
 if (!normalizedDirectory || !/^[0-9a-f]{7,64}$/i.test(normalizedSha)) {
  return false;
 }
 const result = await runGitCommand(normalizedDirectory, ['merge-base', '--is-ancestor', normalizedSha, 'HEAD']);
 return result.success;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Whether `sha` is reachable from the checked-out HEAD. An object git has never
// fetched fails the same way an unrelated commit does: not an ancestor.
export async function isAncestorOfHead(directory, sha) {
  const normalizedDirectory = normalizeDirectoryPath(directory);
  const normalizedSha = typeof sha === 'string' ? sha.trim() : '';
  if (!normalizedDirectory || !/^[0-9a-f]{7,64}$/i.test(normalizedSha)) {
    return false;
  }
  const result = await runGitCommand(normalizedDirectory, ['merge-base', '--is-ancestor', normalizedSha, 'HEAD']);
  return result.success;
=======
export async function isAncestorOfHead(directory: string, sha: string) {
  const normalizedDirectory = normalizeDirectoryPath(directory);
  const normalizedSha = isPrimitiveString(sha) ? sha.trim() : '';
  if (!normalizedDirectory || !/^[0-9a-f]{7,64}$/i.test(normalizedSha)) {
    return false;
  }
  const result = await runGitCommand(normalizedDirectory, ['merge-base', '--is-ancestor', normalizedSha, 'HEAD']);
  return result.success;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

const PATCH_EQUIVALENCE_TIMEOUT_MS = 5_000;

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Whether a commit has an equivalent patch reachable from the checked-out HEAD.
// Missing objects and ambiguous prefixes cannot prove it.
export async function isPatchEquivalentOfHead(directory, sha) {
 const normalizedDirectory = normalizeDirectoryPath(directory);
 const normalizedSha = String(sha ?? '').trim();
 if (!normalizedDirectory || !/^[0-9a-f]{7,64}$/i.test(normalizedSha)) {
  return false;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Whether a commit has an equivalent patch reachable from the checked-out HEAD.
// Missing objects and ambiguous prefixes cannot prove it.
export async function isPatchEquivalentOfHead(directory, sha) {
  const normalizedDirectory = normalizeDirectoryPath(directory);
  const normalizedSha = String(sha ?? '').trim();
  if (!normalizedDirectory || !/^[0-9a-f]{7,64}$/i.test(normalizedSha)) {
    return false;
  }
=======
export async function isPatchEquivalentOfHead(directory: string, sha: string) {
  const normalizedDirectory = normalizeDirectoryPath(directory);
  const normalizedSha = String(sha ?? '').trim();
  if (!normalizedDirectory || !/^[0-9a-f]{7,64}$/i.test(normalizedSha)) {
    return false;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const cherry = await runGitCommand(
  normalizedDirectory,
  ['cherry', 'HEAD', normalizedSha, `${normalizedSha}^`],
  { timeoutMs: PATCH_EQUIVALENCE_TIMEOUT_MS },
 );
 if (!cherry.success) {
  return false;
 }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const expectedPrefix = normalizedSha.toLowerCase();
 return cherry.stdout.split(/\r?\n/).some((line) => {
  const match = line.match(/^-\s+([0-9a-f]{40,64})$/i);
  return Boolean(match?.[1]) && match[1].toLowerCase().startsWith(expectedPrefix);
 });
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const expectedPrefix = normalizedSha.toLowerCase();
  return cherry.stdout.split(/\r?\n/).some((line) => {
    const match = line.match(/^-\s+([0-9a-f]{40,64})$/i);
    return Boolean(match?.[1]) && match[1].toLowerCase().startsWith(expectedPrefix);
  });
=======
  const expectedPrefix = normalizedSha.toLowerCase();
  return cherry.stdout.split(/\r?\n/).some((line) => {
    const match = line.match(/^-\s+([0-9a-f]{40,64})$/i);
    return Boolean(match?.[1]) && (match?.[1] ?? '').toLowerCase().startsWith(expectedPrefix);
  });
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
async function readStatus(normalizedDirectory, lightMode) {
 try {
  const repository = await probeRepository(normalizedDirectory);
  if (!repository.isRepository) {
   throw new Error('fatal: not a git repository (or any of the parent directories): .git');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
async function readStatus(normalizedDirectory, lightMode) {
  try {
    // Prefer an explicit non-repo check before simple-git status so a missing
    // repository never depends on process.cwd() or an opaque GitError shape.
    // The same probe names the repository root, so the read does not ask again.
    const repository = await probeRepository(normalizedDirectory);
    if (!repository.isRepository) {
      throw new Error('fatal: not a git repository (or any of the parent directories): .git');
    }

    const gitOptions = { stallTimeoutMs: GIT_STATUS_STALL_TIMEOUT_MS, optionalLocks: false };
    const { directoryPath, repoRoot, git } = repository.repoRoot
      ? { directoryPath: normalizedDirectory, repoRoot: repository.repoRoot, git: await createGit(repository.repoRoot, gitOptions) }
      : await createRepositoryGitContext(normalizedDirectory, gitOptions);

    // `-unormal` lists a directory with no tracked files as one `dir/` entry
    // and stops walking it at its first file. `-uall` would walk every file
    // in it: on a forgotten build or dependency directory that is a scan of
    // tens of thousands of files and hundreds of megabytes per status read.
    // Directories are expanded to their files afterwards, up to a bound.
    // HEAD is probed alongside: Git reports an unborn branch (a fresh
    // `git init`, nothing committed) as an ordinary empty one, and clients
    // must tell the two apart (`unborn` below).
    const [status, headProbe] = await Promise.all([
      git.status(['-unormal']),
      runGitCommand(repoRoot, ['rev-parse', '--verify', '--quiet', 'HEAD'], { timeoutMs: GIT_PROBE_TIMEOUT_MS }),
    ]);
    status.files = await expandUntrackedDirectories(repoRoot, status.files);

    // Light mode: skip numstat + new-file line counting for faster response.
    // Staged (`--cached`: HEAD -> index) and working (`--numstat`: index -> worktree)
    // stay in separate maps. A partially staged file has an entry in both, and the
    // UI shows each row's own scope instead of a combined total. The working
    // side uses `diff-files`: `git diff` rewrites a stale index under
    // `index.lock` even with GIT_OPTIONAL_LOCKS=0. `-M` keeps the rename
    // detection `git diff` does by default.
    const [stagedStatsRaw, workingStatsRaw] = lightMode
      ? ['', '']
      : await Promise.all([
          git.raw(['diff', '--cached', '--numstat', '-z']).catch(() => ''),
          git.raw(['diff-files', '-M', '--numstat', '-z']).catch(() => ''),
        ]);

    const stagedDiffStats = {};
    const workingDiffStats = {};

    const accumulateStats = (raw, target) => {
      if (!raw) return;
      // NUL-terminated records (`--numstat -z`) keep path bytes verbatim, so a
      // key equals `status.files[].path` for names Git would otherwise quote
      // (non-ASCII, quotes, control characters). A rename or copy record has an
      // empty path field with the old and the new path as their own tokens; the
      // counts belong to the destination path, the one status reports. Same
      // record shape as the commit-file parser in getCommitFiles below.
      const tokens = raw.split('\0');
      for (let index = 0; index < tokens.length; index += 1) {
        const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(tokens[index]);
        if (!match) continue;
        let path = match[3];
        if (!path) {
          path = tokens[index + 2];
          index += 2;
        }
        if (!path) continue;
        const insertions = match[1] === '-' ? 0 : parseInt(match[1], 10) || 0;
        const deletions = match[2] === '-' ? 0 : parseInt(match[2], 10) || 0;

        const existing = target[path] || { insertions: 0, deletions: 0 };
        target[path] = {
          insertions: existing.insertions + insertions,
          deletions: existing.deletions + deletions,
        };
      }
    };

    accumulateStats(stagedStatsRaw, stagedDiffStats);
    accumulateStats(workingStatsRaw, workingDiffStats);

    const diffStats = { staged: stagedDiffStats, working: workingDiffStats };

    const MAX_NEW_FILE_STATS = 200;
    const MAX_NEW_FILE_STAT_SIZE = 1024 * 1024;
    const newFileStats = [];

    if (!lightMode) {
      for (const file of status.files) {
        if (newFileStats.length >= MAX_NEW_FILE_STATS) {
          break;
        }

        const working = (file.working_dir || '').trim();
        const indexStatus = (file.index || '').trim();
        const statusCode = working || indexStatus;

        if (statusCode !== '?' && statusCode !== 'A') {
          continue;
        }

        // Untracked and working-tree-added files belong to the working scope;
        // a file whose 'A' code is on the index belongs to the staged scope.
        const target = working === '?' || working === 'A' ? workingDiffStats : stagedDiffStats;
        const existing = target[file.path];
        if (existing && existing.insertions > 0) {
          continue;
        }

        const absolutePath = path.join(repoRoot, file.path);

        try {
          const stat = await fsp.stat(absolutePath);
          if (!stat.isFile() || stat.size > MAX_NEW_FILE_STAT_SIZE) {
            continue;
          }

          const buffer = await fsp.readFile(absolutePath);
          if (buffer.indexOf(0) !== -1) {
            newFileStats.push({
              target,
              path: file.path,
              insertions: existing?.insertions ?? 0,
              deletions: existing?.deletions ?? 0,
            });
            continue;
          }

          const normalized = buffer.toString('utf8').replace(/\r\n/g, '\n');
          if (!normalized.length) {
            newFileStats.push({
              target,
              path: file.path,
              insertions: 0,
              deletions: 0,
            });
            continue;
          }

          const segments = normalized.split('\n');
          if (normalized.endsWith('\n')) {
            segments.pop();
          }

          const lineCount = segments.length;
          newFileStats.push({
            target,
            path: file.path,
            insertions: lineCount,
            deletions: 0,
          });
        } catch (error) {
          if (error?.code !== 'ENOENT') {
            console.warn('Failed to estimate diff stats for new file', file.path, error);
          }
        }
      }
    }

    for (const entry of newFileStats) {
      entry.target[entry.path] = {
        insertions: entry.insertions,
        deletions: entry.deletions,
      };
    }

    const selectBaseRefForUnpublished = async () => {
      const candidates = [];

      const originHead = await git
        .raw(['symbolic-ref', '-q', 'refs/remotes/origin/HEAD'])
        .then((value) => String(value || '').trim())
        .catch(() => '');

      if (originHead) {
        // "refs/remotes/origin/main" -> "origin/main"
        candidates.push(originHead.replace(/^refs\/remotes\//, ''));
      }

      candidates.push('origin/main', 'origin/master', 'main', 'master');

      for (const ref of candidates) {
        // A branch compared with itself always reads 0 commits ahead, which
        // would let a never-pushed `main` pass as having nothing unpublished.
        if (ref === status.current) continue;
        const exists = await git
          .raw(['rev-parse', '--verify', ref])
          .then((value) => String(value || '').trim())
          .catch(() => '');
        if (exists) return ref;
      }

      return null;
    };

    let tracking = status.tracking || null;
    let ahead = status.ahead;
    let behind = status.behind;
    // The ref `ahead` was counted against when there is no upstream; null when
    // that count was not made, so a bare 0 never reads as "nothing unpublished".
    let aheadBase = null;
    let upstreamComparison;

    // When no upstream is configured (common for new worktree branches), Git doesn't report ahead/behind.
    // We still want to show the number of unpublished commits to the user.
    // Light mode skips this — the basic ahead/behind from git status is sufficient for polling.
    if (!lightMode && !tracking && status.current) {
      const baseRef = await selectBaseRefForUnpublished();
      if (baseRef) {
        // Commits already on a remote are published even without an upstream:
        // a contributor's PR head arrives as a fork remote-tracking branch.
        const countRaw = await git
          .raw(['rev-list', '--count', 'HEAD', '--not', baseRef, '--remotes'])
          .then((value) => String(value || '').trim())
          .catch(() => '');
        const count = parseInt(countRaw, 10);
        if (Number.isFinite(count)) {
          ahead = count;
          behind = 0;
          aheadBase = baseRef;
        }
      }
    }

    if (
      !lightMode
      && status.current
      && (!tracking || !tracking.startsWith('upstream/'))
      && await hasRemote(git, directoryPath, 'upstream')
    ) {
      upstreamComparison = await getRemoteBranchComparison(git, 'upstream', status.current);
    }

    // Check for in-progress operations. One `--git-path` call locates every
    // marker, and the markers themselves are plain files: MERGE_HEAD is always
    // a file in the git dir, whatever the ref storage.
    let mergeInProgress = null;
    let rebaseInProgress = null;
    const [mergeHeadPath = '', mergeMsgPath = '', rebaseMergePath = '', rebaseApplyPath = ''] = await git
      .raw(['rev-parse', '--git-path', 'MERGE_HEAD', '--git-path', 'MERGE_MSG', '--git-path', 'rebase-merge', '--git-path', 'rebase-apply'])
      .then((value) => String(value || '').split(/\r?\n/).slice(0, 4).map((line) => (
        line.trim() ? path.resolve(repoRoot, normalizeGitOutputPath(line.trim())) : ''
      )))
      .catch(() => []);
    const pathExists = (target) => (target ? fsp.stat(target).then(() => true).catch(() => false) : false);

    try {
      if (await pathExists(mergeHeadPath)) {
        const mergeHead = await git.raw(['rev-parse', 'MERGE_HEAD']).catch(() => '');
        const headSha = mergeHead.trim().slice(0, 7);
        // Only set mergeInProgress if we actually have a valid head SHA
        if (headSha) {
          const mergeMsg = mergeMsgPath ? await fsp.readFile(mergeMsgPath, 'utf8').catch(() => '') : '';
          mergeInProgress = {
            head: headSha,
            message: mergeMsg.split('\n')[0] || '',
          };
        }
      }
    } catch {
      // ignore
    }

    try {
      // Check for rebase in progress (.git/rebase-merge or .git/rebase-apply)
      const rebaseMergeExists = await pathExists(rebaseMergePath);
      const rebaseApplyExists = await pathExists(rebaseApplyPath);
      
      if (rebaseMergeExists || rebaseApplyExists) {
        const rebasePath = rebaseMergeExists ? rebaseMergePath : rebaseApplyPath;
        const headName = await fsp.readFile(path.join(rebasePath, 'head-name'), 'utf8').catch(() => '');
        const onto = await fsp.readFile(path.join(rebasePath, 'onto'), 'utf8').catch(() => '');
        
        const headNameTrimmed = headName.trim().replace('refs/heads/', '');
        const ontoTrimmed = onto.trim().slice(0, 7);
        
        // Only set rebaseInProgress if we have valid data
        if (headNameTrimmed || ontoTrimmed) {
          rebaseInProgress = {
            headName: headNameTrimmed,
            onto: ontoTrimmed,
          };
        }
      }
    } catch {
      // ignore
    }

    return {
      current: status.current,
      tracking,
      // Exit 1 from `rev-parse --verify --quiet HEAD` means HEAD names a branch
      // with no commit yet. Any other failure (timeout, corrupt repository) is
      // not that answer, and stays false so the repository reads as established.
      unborn: headProbe.exitCode === 1,
      ahead,
      behind,
      aheadBase,
      upstreamComparison,
      files: status.files.map((f) => ({
        path: f.path,
        index: f.index,
        working_dir: f.working_dir,
      })),
      isClean: status.isClean(),
      diffStats: lightMode ? undefined : diffStats,
      mergeInProgress,
      rebaseInProgress,
    };
  } catch (error) {
    if (isNotGitRepositoryError(error) || isMissingDirectoryError(error)) {
      // Re-throw a plain Error so route/session callers can match reliably and
      // continue enumerating other projects instead of treating GitError as 500.
      throw new Error('fatal: not a git repository (or any of the parent directories): .git');
    }
    console.error('Failed to get Git status:', error);
    throw error;
=======
async function readStatus(normalizedDirectory: string, lightMode: boolean) {
  try {
    const repository = await probeRepository(normalizedDirectory);
    if (!repository.isRepository) {
      throw new Error('fatal: not a git repository (or any of the parent directories): .git');
    }

    const gitOptions = { stallTimeoutMs: GIT_STATUS_STALL_TIMEOUT_MS, optionalLocks: false };
    const { directoryPath, repoRoot, git } = repository.repoRoot
      ? { directoryPath: normalizedDirectory, repoRoot: repository.repoRoot, git: await createGit(repository.repoRoot, gitOptions) }
      : await createRepositoryGitContext(normalizedDirectory, gitOptions);

    const [status, headProbe] = await Promise.all([
      git.status(['-unormal']),
      runGitCommand(repoRoot, ['rev-parse', '--verify', '--quiet', 'HEAD'], { timeoutMs: GIT_PROBE_TIMEOUT_MS }),
    ]);
    status.files = await expandUntrackedDirectories(repoRoot, status.files);

    const [stagedStatsRaw, workingStatsRaw] = lightMode
      ? ['', '']
      : await Promise.all([
          git.raw(['diff', '--cached', '--numstat', '-z']).catch(() => ''),
          git.raw(['diff-files', '-M', '--numstat', '-z']).catch(() => ''),
        ]);

    const stagedDiffStats: Record<string, DiffStats> = {};
    const workingDiffStats: Record<string, DiffStats> = {};

    const accumulateStats = (raw: string, target: Record<string, DiffStats>) => {
      if (!raw) return;
      const tokens = raw.split('\0');
      for (let index = 0; index < tokens.length; index += 1) {
        const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(String(tokens[index]));
        if (!match) continue;
        let path = match[3];
        if (!path) {
          path = tokens[index + 2];
          index += 2;
        }
        if (!path) continue;
        const insertions = match[1] === '-' ? 0 : parseInt(String(match[1]), 10) || 0;
        const deletions = match[2] === '-' ? 0 : parseInt(String(match[2]), 10) || 0;

        const existing = target[path] || { insertions: 0, deletions: 0 };
        target[path] = {
          insertions: existing.insertions + insertions,
          deletions: existing.deletions + deletions,
        };
      }
    };

    accumulateStats(stagedStatsRaw, stagedDiffStats);
    accumulateStats(workingStatsRaw, workingDiffStats);

    const diffStats = { staged: stagedDiffStats, working: workingDiffStats };

    const MAX_NEW_FILE_STATS = 200;
    const MAX_NEW_FILE_STAT_SIZE = 1024 * 1024;
    const newFileStats = [];

    if (!lightMode) {
      for (const file of status.files) {
        if (newFileStats.length >= MAX_NEW_FILE_STATS) {
          break;
        }

        const working = (file.working_dir || '').trim();
        const indexStatus = (file.index || '').trim();
        const statusCode = working || indexStatus;

        if (statusCode !== '?' && statusCode !== 'A') {
          continue;
        }

        const target = working === '?' || working === 'A' ? workingDiffStats : stagedDiffStats;
        const existing = target[file.path];
        if (existing && existing.insertions > 0) {
          continue;
        }

        const absolutePath = path.join(repoRoot, file.path);

        try {
          const stat = await fsp.stat(absolutePath);
          if (!stat.isFile() || stat.size > MAX_NEW_FILE_STAT_SIZE) {
            continue;
          }

          const buffer = await fsp.readFile(absolutePath);
          if (buffer.indexOf(0) !== -1) {
            newFileStats.push({
              target,
              path: file.path,
              insertions: existing?.insertions ?? 0,
              deletions: existing?.deletions ?? 0,
            });
            continue;
          }

          const normalized = buffer.toString('utf8').replace(/\r\n/g, '\n');
          if (!normalized.length) {
            newFileStats.push({
              target,
              path: file.path,
              insertions: 0,
              deletions: 0,
            });
            continue;
          }

          const segments = normalized.split('\n');
          if (normalized.endsWith('\n')) {
            segments.pop();
          }

          const lineCount = segments.length;
          newFileStats.push({
            target,
            path: file.path,
            insertions: lineCount,
            deletions: 0,
          });
        } catch (error) {
          if (errorField(error, 'code') !== 'ENOENT') {
            console.warn('Failed to estimate diff stats for new file', file.path, error);
          }
        }
      }
    }

    for (const entry of newFileStats) {
      entry.target[entry.path] = {
        insertions: entry.insertions,
        deletions: entry.deletions,
      };
    }

    const selectBaseRefForUnpublished = async () => {
      const candidates = [];

      const originHead = await git
        .raw(['symbolic-ref', '-q', 'refs/remotes/origin/HEAD'])
        .then((value) => String(value || '').trim())
        .catch(() => '');

      if (originHead) {
        candidates.push(originHead.replace(/^refs\/remotes\//, ''));
      }

      candidates.push('origin/main', 'origin/master', 'main', 'master');

      for (const ref of candidates) {
        if (ref === status.current) continue;
        const exists = await git
          .raw(['rev-parse', '--verify', ref])
          .then((value) => String(value || '').trim())
          .catch(() => '');
        if (exists) return ref;
      }

      return null;
    };

    const tracking = status.tracking || null;
    let ahead = status.ahead;
    let behind = status.behind;
    let aheadBase = null;
    let upstreamComparison;

    if (!lightMode && !tracking && status.current) {
      const baseRef = await selectBaseRefForUnpublished();
      if (baseRef) {
        const countRaw = await git
          .raw(['rev-list', '--count', 'HEAD', '--not', baseRef, '--remotes'])
          .then((value) => String(value || '').trim())
          .catch(() => '');
        const count = parseInt(countRaw, 10);
        if (Number.isFinite(count)) {
          ahead = count;
          behind = 0;
          aheadBase = baseRef;
        }
      }
    }

    if (
      !lightMode
      && status.current
      && (!tracking || !tracking.startsWith('upstream/'))
      && await hasRemote(git, directoryPath, 'upstream')
    ) {
      upstreamComparison = await getRemoteBranchComparison(git, 'upstream', status.current);
    }

    let mergeInProgress = null;
    let rebaseInProgress = null;
    const [mergeHeadPath = '', mergeMsgPath = '', rebaseMergePath = '', rebaseApplyPath = ''] = await git
      .raw(['rev-parse', '--git-path', 'MERGE_HEAD', '--git-path', 'MERGE_MSG', '--git-path', 'rebase-merge', '--git-path', 'rebase-apply'])
      .then((value) => String(value || '').split(/\r?\n/).slice(0, 4).map((line) => (
        line.trim() ? path.resolve(repoRoot, normalizeGitOutputPath(line.trim())) : ''
      )))
      .catch(() => []);
    const pathExists = (target: string) => (target ? fsp.stat(target).then(() => true).catch(() => false) : false);

    try {
      if (await pathExists(mergeHeadPath)) {
        const mergeHead = await git.raw(['rev-parse', 'MERGE_HEAD']).catch(() => '');
        const headSha = mergeHead.trim().slice(0, 7);
        if (headSha) {
          const mergeMsg = mergeMsgPath ? await fsp.readFile(mergeMsgPath, 'utf8').catch(() => '') : '';
          mergeInProgress = {
            head: headSha,
            message: mergeMsg.split('\n')[0] || '',
          };
        }
      }
    } catch {
      void 0;
    }

    try {
      const rebaseMergeExists = await pathExists(rebaseMergePath);
      const rebaseApplyExists = await pathExists(rebaseApplyPath);
      
      if (rebaseMergeExists || rebaseApplyExists) {
        const rebasePath = rebaseMergeExists ? rebaseMergePath : rebaseApplyPath;
        const headName = await fsp.readFile(path.join(rebasePath, 'head-name'), 'utf8').catch(() => '');
        const onto = await fsp.readFile(path.join(rebasePath, 'onto'), 'utf8').catch(() => '');
        
        const headNameTrimmed = headName.trim().replace('refs/heads/', '');
        const ontoTrimmed = onto.trim().slice(0, 7);
        
        if (headNameTrimmed || ontoTrimmed) {
          rebaseInProgress = {
            headName: headNameTrimmed,
            onto: ontoTrimmed,
          };
        }
      }
    } catch {
      void 0;
    }

    return {
      current: status.current,
      tracking,
      unborn: headProbe.exitCode === 1,
      ahead,
      behind,
      aheadBase,
      upstreamComparison,
      files: status.files.map((f) => ({
        path: f.path,
        index: f.index,
        working_dir: f.working_dir,
        previousPath: f.from || undefined,
      })),
      isClean: status.isClean(),
      diffStats: lightMode ? undefined : diffStats,
      mergeInProgress,
      rebaseInProgress,
    };
  } catch (error) {
    if (isNotGitRepositoryError(error) || isMissingDirectoryError(error)) {
      throw new Error('fatal: not a git repository (or any of the parent directories): .git');
    }
    console.error('Failed to get Git status:', error);
    throw error;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

  const gitOptions = { stallTimeoutMs: GIT_STATUS_STALL_TIMEOUT_MS, optionalLocks: false };
  const { directoryPath, repoRoot, git } = repository.repoRoot
   ? { directoryPath: normalizedDirectory, repoRoot: repository.repoRoot, git: await createGit(repository.repoRoot, gitOptions) }
   : await createRepositoryGitContext(normalizedDirectory, gitOptions);

  // `-unormal` lists a directory with no tracked files as one `dir/` entry
  // and stops walking it at its first file. `-uall` would walk every file
  // in it: on a forgotten build or dependency directory that is a scan of
  // tens of thousands of files and hundreds of megabytes per status read.
  // Directories are expanded to their files afterwards, up to a bound.
  // HEAD is probed alongside: Git reports an unborn branch (a fresh
  // `git init`, nothing committed) as an ordinary empty one, and clients
  // must tell the two apart (`unborn` below).
  const [status, headProbe] = await Promise.all([
   git.status(['-unormal']),
   runGitCommand(repoRoot, ['rev-parse', '--verify', '--quiet', 'HEAD'], { timeoutMs: GIT_PROBE_TIMEOUT_MS }),
  ]);
  status.files = await expandUntrackedDirectories(repoRoot, status.files);

  // Light mode: skip numstat + new-file line counting for faster response.
  // Staged (`--cached`: HEAD -> index) and working (`--numstat`: index -> worktree)
  // stay in separate maps. A partially staged file has an entry in both, and the
  // UI shows each row's own scope instead of a combined total. The working
  // side uses `diff-files`: `git diff` rewrites a stale index under
  // `index.lock` even with GIT_OPTIONAL_LOCKS=0. `-M` keeps the rename
  // detection `git diff` does by default.
  const [stagedStatsRaw, workingStatsRaw] = lightMode
   ? ['', '']
   : await Promise.all([
    git.raw(['diff', '--cached', '--numstat', '-z']).catch(() => ''),
    git.raw(['diff-files', '-M', '--numstat', '-z']).catch(() => ''),
   ]);

  const stagedDiffStats = {};
  const workingDiffStats = {};

  const accumulateStats = (raw, target) => {
   if (!raw) return;
   // NUL-terminated records (`--numstat -z`) keep path bytes verbatim, so a
   // key equals `status.files[].path` for names Git would otherwise quote
   // (non-ASCII, quotes, control characters). A rename or copy record has an
   // empty path field with the old and the new path as their own tokens; the
   // counts belong to the destination path, the one status reports. Same
   // record shape as the commit-file parser in getCommitFiles below.
   const tokens = raw.split('\0');
   for (let index = 0; index < tokens.length; index += 1) {
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(tokens[index]);
    if (!match) continue;
    let path = match[3];
    if (!path) {
     path = tokens[index + 2];
     index += 2;
    }
    if (!path) continue;
    const insertions = match[1] === '-' ? 0 : parseInt(match[1], 10) || 0;
    const deletions = match[2] === '-' ? 0 : parseInt(match[2], 10) || 0;

    const existing = target[path] || { insertions: 0, deletions: 0 };
    target[path] = {
     insertions: existing.insertions + insertions,
     deletions: existing.deletions + deletions,
    };
   }
  };

  accumulateStats(stagedStatsRaw, stagedDiffStats);
  accumulateStats(workingStatsRaw, workingDiffStats);

  const diffStats = { staged: stagedDiffStats, working: workingDiffStats };

  const MAX_NEW_FILE_STATS = 200;
  const MAX_NEW_FILE_STAT_SIZE = 1024 * 1024;
  const newFileStats = [];

  if (!lightMode) {
   for (const file of status.files) {
    if (newFileStats.length >= MAX_NEW_FILE_STATS) {
     break;
    }

    const working = (file.working_dir || '').trim();
    const indexStatus = (file.index || '').trim();
    const statusCode = working || indexStatus;

    if (statusCode !== '?' && statusCode !== 'A') {
     continue;
    }

    // Untracked and working-tree-added files belong to the working scope;
    // a file whose 'A' code is on the index belongs to the staged scope.
    const target = working === '?' || working === 'A' ? workingDiffStats : stagedDiffStats;
    const existing = target[file.path];
    if (existing && existing.insertions > 0) {
     continue;
    }

    const absolutePath = path.join(repoRoot, file.path);

    try {
     const stat = await fsp.stat(absolutePath);
     if (!stat.isFile() || stat.size > MAX_NEW_FILE_STAT_SIZE) {
      continue;
     }

     const buffer = await fsp.readFile(absolutePath);
     if (buffer.indexOf(0) !== -1) {
      newFileStats.push({
       target,
       path: file.path,
       insertions: existing?.insertions ?? 0,
       deletions: existing?.deletions ?? 0,
      });
      continue;
     }

     const normalized = buffer.toString('utf8').replace(/\r\n/g, '\n');
     if (!normalized.length) {
      newFileStats.push({
       target,
       path: file.path,
       insertions: 0,
       deletions: 0,
      });
      continue;
     }

     const segments = normalized.split('\n');
     if (normalized.endsWith('\n')) {
      segments.pop();
     }

     const lineCount = segments.length;
     newFileStats.push({
      target,
      path: file.path,
      insertions: lineCount,
      deletions: 0,
     });
    } catch (error) {
     if (error?.code !== 'ENOENT') {
      console.warn('Failed to estimate diff stats for new file', file.path, error);
     }
    }
   }
  }

  for (const entry of newFileStats) {
   entry.target[entry.path] = {
    insertions: entry.insertions,
    deletions: entry.deletions,
   };
  }

  const selectBaseRefForUnpublished = async () => {
   const candidates = [];

   const originHead = await git
    .raw(['symbolic-ref', '-q', 'refs/remotes/origin/HEAD'])
    .then((value) => String(value || '').trim())
    .catch(() => '');

   if (originHead) {
    // "refs/remotes/origin/main" -> "origin/main"
    candidates.push(originHead.replace(/^refs\/remotes\//, ''));
   }

   candidates.push('origin/main', 'origin/master', 'main', 'master');

   for (const ref of candidates) {
    // A branch compared with itself always reads 0 commits ahead, which
    // would let a never-pushed `main` pass as having nothing unpublished.
    if (ref === status.current) continue;
    const exists = await git
     .raw(['rev-parse', '--verify', ref])
     .then((value) => String(value || '').trim())
     .catch(() => '');
    if (exists) return ref;
   }

   return null;
  };

  let tracking = status.tracking || null;
  let ahead = status.ahead;
  let behind = status.behind;
  // The ref `ahead` was counted against when there is no upstream; null when
  // that count was not made, so a bare 0 never reads as "nothing unpublished".
  let aheadBase = null;
  let upstreamComparison;

  // When no upstream is configured (common for new worktree branches), Git doesn't report ahead/behind.
  // We still want to show the number of unpublished commits to the user.
  // Light mode skips this — the basic ahead/behind from git status is sufficient for polling.
  if (!lightMode && !tracking && status.current) {
   const baseRef = await selectBaseRefForUnpublished();
   if (baseRef) {
    // Commits already on a remote are published even without an upstream:
    // a contributor's PR head arrives as a fork remote-tracking branch.
    const countRaw = await git
     .raw(['rev-list', '--count', 'HEAD', '--not', baseRef, '--remotes'])
     .then((value) => String(value || '').trim())
     .catch(() => '');
    const count = parseInt(countRaw, 10);
    if (Number.isFinite(count)) {
     ahead = count;
     behind = 0;
     aheadBase = baseRef;
    }
   }
  }

  if (
   !lightMode
   && status.current
   && (!tracking || !tracking.startsWith('upstream/'))
   && await hasRemote(git, directoryPath, 'upstream')
  ) {
   upstreamComparison = await getRemoteBranchComparison(git, 'upstream', status.current);
  }

  // Check for in-progress operations. One `--git-path` call locates every
  // marker, and the markers themselves are plain files: MERGE_HEAD is always
  // a file in the git dir, whatever the ref storage.
  let mergeInProgress = null;
  let rebaseInProgress = null;
  const [mergeHeadPath = '', mergeMsgPath = '', rebaseMergePath = '', rebaseApplyPath = ''] = await git
   .raw(['rev-parse', '--git-path', 'MERGE_HEAD', '--git-path', 'MERGE_MSG', '--git-path', 'rebase-merge', '--git-path', 'rebase-apply'])
   .then((value) => String(value || '').split(/\r?\n/).slice(0, 4).map((line) => (
    line.trim() ? path.resolve(repoRoot, normalizeGitOutputPath(line.trim())) : ''
   )))
   .catch(() => []);
  const pathExists = (target) => (target ? fsp.stat(target).then(() => true).catch(() => false) : false);

  try {
   if (await pathExists(mergeHeadPath)) {
    const mergeHead = await git.raw(['rev-parse', 'MERGE_HEAD']).catch(() => '');
    const headSha = mergeHead.trim().slice(0, 7);
    // Only set mergeInProgress if we actually have a valid head SHA
    if (headSha) {
     const mergeMsg = mergeMsgPath ? await fsp.readFile(mergeMsgPath, 'utf8').catch(() => '') : '';
     mergeInProgress = {
      head: headSha,
      message: mergeMsg.split('\n')[0] || '',
     };
    }
   }
  } catch {
   // ignore
  }

  try {
   // Check for rebase in progress (.git/rebase-merge or .git/rebase-apply)
   const rebaseMergeExists = await pathExists(rebaseMergePath);
   const rebaseApplyExists = await pathExists(rebaseApplyPath);

   if (rebaseMergeExists || rebaseApplyExists) {
    const rebasePath = rebaseMergeExists ? rebaseMergePath : rebaseApplyPath;
    const headName = await fsp.readFile(path.join(rebasePath, 'head-name'), 'utf8').catch(() => '');
    const onto = await fsp.readFile(path.join(rebasePath, 'onto'), 'utf8').catch(() => '');

    const headNameTrimmed = headName.trim().replace('refs/heads/', '');
    const ontoTrimmed = onto.trim().slice(0, 7);

    // Only set rebaseInProgress if we have valid data
    if (headNameTrimmed || ontoTrimmed) {
     rebaseInProgress = {
      headName: headNameTrimmed,
      onto: ontoTrimmed,
     };
    }
   }
  } catch {
   // ignore
  }

  return {
   current: status.current,
   tracking,
   // Exit 1 from `rev-parse --verify --quiet HEAD` means HEAD names a branch
   // with no commit yet. Any other failure (timeout, corrupt repository) is
   // not that answer, and stays false so the repository reads as established.
   unborn: headProbe.exitCode === 1,
   ahead,
   behind,
   aheadBase,
   upstreamComparison,
   files: status.files.map((f) => ({
    path: f.path,
    index: f.index,
    working_dir: f.working_dir,
   })),
   isClean: status.isClean(),
   diffStats: lightMode ? undefined : diffStats,
   mergeInProgress,
   rebaseInProgress,
  };
 } catch (error) {
  if (isNotGitRepositoryError(error) || isMissingDirectoryError(error)) {
   // Re-throw a plain Error so route/session callers can match reliably and
   // continue enumerating other projects instead of treating GitError as 500.
   throw new Error('fatal: not a git repository (or any of the parent directories): .git');
  }
  console.error('Failed to get Git status:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const getNoIndexDiff = async (repoRoot, repoPath, contextLines) => {
 const args = ['diff', '--no-color', '--full-index', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/'];
 if (Number.isFinite(contextLines)) {
  args.push(`-U${Math.max(0, contextLines)}`);
 }
 args.push('--no-index', '--', '/dev/null', repoPath);
 const result = await runGitCommand(repoRoot, args);
 // Exit 1 means differences, even when Git also writes warnings to stderr.
 // Spawn and buffer errors have no numeric exit code and must still fail.
 if (result.exitCode === 0 || result.exitCode === 1) {
  return result.stdout;
 }
 throw new Error(result.stderr || result.message || 'Failed to get untracked Git diff');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const getNoIndexDiff = async (repoRoot, repoPath, contextLines) => {
  const args = ['diff', '--no-color', '--full-index', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/'];
  if (Number.isFinite(contextLines)) {
    args.push(`-U${Math.max(0, contextLines)}`);
  }
  args.push('--no-index', '--', '/dev/null', repoPath);
  const result = await runGitCommand(repoRoot, args);
  // Exit 1 means differences, even when Git also writes warnings to stderr.
  // Spawn and buffer errors have no numeric exit code and must still fail.
  if (result.exitCode === 0 || result.exitCode === 1) {
    return result.stdout;
  }
  throw new Error(result.stderr || result.message || 'Failed to get untracked Git diff');
=======
const getNoIndexDiff = async (repoRoot: string, repoPath: string, contextLines: number) => {
  const args = ['diff', '--no-color', '--full-index', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/'];
  if (Number.isFinite(contextLines)) {
    args.push(`-U${Math.max(0, contextLines)}`);
  }
  args.push('--no-index', '--', '/dev/null', repoPath);
  const result = await runGitCommand(repoRoot, args);
  if (result.exitCode === 0 || result.exitCode === 1) {
    return result.stdout;
  }
  throw new Error(result.stderr || result.message || 'Failed to get untracked Git diff');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function getDiff(directory, { path: filePath, staged = false, contextLines = 3 } = {}) {
 const context = await createRepositoryGitContext(directory);
 const fileContext = filePath
  ? await resolveGitFileContext(context.directoryPath, context.directoryGit, filePath, context.repoRoot)
  : null;
 return readDiff(context, fileContext, { staged, contextLines });
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function getDiff(directory, { path: filePath, staged = false, contextLines = 3 } = {}) {
  const context = await createRepositoryGitContext(directory);
  const fileContext = filePath
    ? await resolveGitFileContext(context.directoryPath, context.directoryGit, filePath, context.repoRoot)
    : null;
  return readDiff(context, fileContext, { staged, contextLines });
=======
export async function getDiff(directory: string, { path: filePath, staged = false, contextLines = 3, previousPath }: DiffOptions = {}) {
  const context = await createRepositoryGitContext(directory);
  const fileContext = filePath
    ? await resolveGitFileContext(context.directoryPath, context.directoryGit, filePath, context.repoRoot)
    : null;
  return readDiff(context, fileContext, { staged, contextLines, previousPath });
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * `getDiff` for one path, plus what a submodule records. A submodule patch is
 * empty when only untracked files changed inside it, so callers need the state
 * to show anything truthful.
 */
export async function getPathDiff(directory, { path: filePath, staged = false, contextLines = 3 } = {}) {
 const context = await createRepositoryGitContext(directory);
 const fileContext = await resolveGitFileContext(context.directoryPath, context.directoryGit, filePath, context.repoRoot);
 const diff = await readDiff(context, fileContext, { staged, contextLines });
 if (!fileContext.isSubmodule) return { diff, submodule: null };
 return { diff, submodule: await readSubmoduleState(context.repoRoot, fileContext) };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * `getDiff` for one path, plus what a submodule records. A submodule patch is
 * empty when only untracked files changed inside it, so callers need the state
 * to show anything truthful.
 */
export async function getPathDiff(directory, { path: filePath, staged = false, contextLines = 3 } = {}) {
  const context = await createRepositoryGitContext(directory);
  const fileContext = await resolveGitFileContext(context.directoryPath, context.directoryGit, filePath, context.repoRoot);
  const diff = await readDiff(context, fileContext, { staged, contextLines });
  if (!fileContext.isSubmodule) return { diff, submodule: null };
  return { diff, submodule: await readSubmoduleState(context.repoRoot, fileContext) };
=======
export async function getPathDiff(directory: string, { path: filePath, staged = false, contextLines = 3, previousPath }: DiffOptions = {}) {
  const context = await createRepositoryGitContext(directory);
  const fileContext = await resolveGitFileContext(context.directoryPath, context.directoryGit, filePath, context.repoRoot);
  const diff = await readDiff(context, fileContext, { staged, contextLines, previousPath });
  if (!fileContext.isSubmodule) return { diff, submodule: null };
  return { diff, submodule: await readSubmoduleState(context.repoRoot, fileContext) };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

const GIT_PATH_ERROR_CODES = new Set(["path_not_found", "nested_repository", "untracked_directory"]);

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * `getPathDiff` for many paths of one side, resolving the repository once and
 * running a bounded number of reads at a time. Returns one entry per input
 * path, in order: `{ path, diff, submodule }`, or `{ path, error, code }` where
 * `code` is a path error code when the path no longer resolves. One failed
 * path never fails the others.
 */
export async function getPathDiffs(directory, { paths: filePaths = [], staged = false, contextLines = 3, concurrency = 8 } = {}) {
 const paths = Array.isArray(filePaths) ? filePaths : [];
 if (paths.length === 0) return [];
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * `getPathDiff` for many paths of one side, resolving the repository once and
 * running a bounded number of reads at a time. Returns one entry per input
 * path, in order: `{ path, diff, submodule }`, or `{ path, error, code }` where
 * `code` is a path error code when the path no longer resolves. One failed
 * path never fails the others.
 */
export async function getPathDiffs(directory, { paths: filePaths = [], staged = false, contextLines = 3, concurrency = 8 } = {}) {
  const paths = Array.isArray(filePaths) ? filePaths : [];
  if (paths.length === 0) return [];
=======
export async function getPathDiffs(directory: string, { paths: filePaths = [], staged = false, contextLines = 3, concurrency = 8 }: { paths?: string[]; staged?: boolean; contextLines?: number; concurrency?: number } = {}) {
  const paths = Array.isArray(filePaths) ? filePaths : [];
  if (paths.length === 0) return [];
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const context = await createRepositoryGitContext(directory);
 const results = new Array(paths.length);
 let cursor = 0;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const context = await createRepositoryGitContext(directory);
  const results = new Array(paths.length);
  let cursor = 0;
=======
  const context = await createRepositoryGitContext(directory);
  const results = new Array<PathDiffResult>(paths.length);
  let cursor = 0;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const worker = async () => {
  while (cursor < paths.length) {
   const index = cursor++;
   const filePath = paths[index];
   try {
    const fileContext = await resolveGitFileContext(context.directoryPath, context.directoryGit, filePath, context.repoRoot);
    const diff = await readDiff(context, fileContext, { staged, contextLines });
    const submodule = fileContext.isSubmodule ? await readSubmoduleState(context.repoRoot, fileContext) : null;
    results[index] = { path: filePath, diff, submodule };
   } catch (error) {
    const code = GIT_PATH_ERROR_CODES.has(error?.code) ? error.code : null;
    results[index] = { path: filePath, error: error?.message || "Failed to get git diff", code };
   }
  }
 };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const worker = async () => {
    while (cursor < paths.length) {
      const index = cursor++;
      const filePath = paths[index];
      try {
        const fileContext = await resolveGitFileContext(context.directoryPath, context.directoryGit, filePath, context.repoRoot);
        const diff = await readDiff(context, fileContext, { staged, contextLines });
        const submodule = fileContext.isSubmodule ? await readSubmoduleState(context.repoRoot, fileContext) : null;
        results[index] = { path: filePath, diff, submodule };
      } catch (error) {
        const code = GIT_PATH_ERROR_CODES.has(error?.code) ? error.code : null;
        results[index] = { path: filePath, error: error?.message || 'Failed to get git diff', code };
      }
    }
  };
=======
  const worker = async () => {
    while (cursor < paths.length) {
      const index = cursor++;
      const filePath = paths[index];
      try {
        const fileContext = await resolveGitFileContext(context.directoryPath, context.directoryGit, filePath, context.repoRoot);
        const diff = await readDiff(context, fileContext, { staged, contextLines });
        const submodule = fileContext.isSubmodule ? await readSubmoduleState(context.repoRoot, fileContext) : null;
        results[index] = { path: filePath, diff, submodule };
      } catch (error) {
        const errorCode = errorField(error, 'code');
        const code = isPrimitiveString(errorCode) && GIT_PATH_ERROR_CODES.has(errorCode) ? errorCode : null;
        results[index] = { path: filePath, error: errorField(error, 'message') || 'Failed to get git diff', code };
      }
    }
  };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 await Promise.all(Array.from({ length: Math.min(concurrency, paths.length) }, worker));
 return results;
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
async function readDiff({ repoRoot, git }, fileContext, { staged, contextLines }) {
 try {
  const args = ['diff', '--no-color', '--full-index', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/'];
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
async function readDiff({ repoRoot, git }, fileContext, { staged, contextLines }) {
  try {
    const args = ['diff', '--no-color', '--full-index', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/'];
=======
async function readDiff({ repoRoot, git }: RepositoryGitContext, fileContext: GitFileContext | null, { staged, contextLines, previousPath }: { staged: boolean; contextLines: number; previousPath?: string | undefined }) {
  try {
    const args = ['diff', '--no-color', '--full-index', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/'];
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  if (typeof contextLines === 'number' && !Number.isNaN(contextLines)) {
   args.push(`-U${Math.max(0, contextLines)}`);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    if (typeof contextLines === 'number' && !Number.isNaN(contextLines)) {
      args.push(`-U${Math.max(0, contextLines)}`);
    }

    if (staged) {
      args.push('--cached');
    }

    if (fileContext) {
      args.push('--', fileContext.repoPath);
    }

    const diff = await git.raw(args);
    if (diff && diff.trim().length > 0) {
      return diff;
    }

    if (staged) {
      return diff;
    }

    if (!fileContext) {
      return diff;
    }

    try {
      await git.raw(['ls-files', '--error-unmatch', '--', fileContext.repoPath]);
      return diff;
    } catch {
      if (fileContext.isSymbolicLink) {
        const target = await fsp.readlink(fileContext.absolutePath);
        return [
          `diff --git a/${fileContext.repoPath} b/${fileContext.repoPath}`,
          'new file mode 120000',
          '--- /dev/null',
          `+++ b/${fileContext.repoPath}`,
          '@@ -0,0 +1 @@',
          `+${target}`,
          '\\ No newline at end of file',
          '',
        ].join('\n');
      }

      return await getNoIndexDiff(repoRoot, fileContext.repoPath, contextLines);
    }
  } catch (error) {
    console.error('Failed to get Git diff:', error);
    throw error;
=======
    if (!Number.isNaN(contextLines)) {
      args.push(`-U${Math.max(0, contextLines)}`);
    }

    if (staged) {
      args.push('--cached');
    }

    if (fileContext) {
      args.push('--', ...[previousPath, fileContext.repoPath].filter(Boolean).map((value) => `:(literal)${value}`));
    }

    const diff = await git.raw(args);
    if (diff && diff.trim().length > 0) {
      return diff;
    }

    if (staged) {
      return diff;
    }

    if (!fileContext) {
      return diff;
    }

    try {
      await git.raw(['ls-files', '--error-unmatch', '--', fileContext.repoPath]);
      return diff;
    } catch {
      if (fileContext.isSymbolicLink) {
        const target = await fsp.readlink(fileContext.absolutePath);
        return [
          `diff --git a/${fileContext.repoPath} b/${fileContext.repoPath}`,
          'new file mode 120000',
          '--- /dev/null',
          `+++ b/${fileContext.repoPath}`,
          '@@ -0,0 +1 @@',
          `+${target}`,
          '\\ No newline at end of file',
          '',
        ].join('\n');
      }

      return await getNoIndexDiff(repoRoot, fileContext.repoPath, contextLines);
    }
  } catch (error) {
    console.error('Failed to get Git diff:', error);
    throw error;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

  if (staged) {
   args.push('--cached');
  }

  if (fileContext) {
   args.push('--', fileContext.repoPath);
  }

  const diff = await git.raw(args);
  if (diff && diff.trim().length > 0) {
   return diff;
  }

  if (staged) {
   return diff;
  }

  if (!fileContext) {
   return diff;
  }

  try {
   await git.raw(['ls-files', '--error-unmatch', '--', fileContext.repoPath]);
   return diff;
  } catch {
   if (fileContext.isSymbolicLink) {
    const target = await fsp.readlink(fileContext.absolutePath);
    return [
     `diff --git a/${fileContext.repoPath} b/${fileContext.repoPath}`,
     'new file mode 120000',
     '--- /dev/null',
     `+++ b/${fileContext.repoPath}`,
     '@@ -0,0 +1 @@',
     `+${target}`,
     '\\ No newline at end of file',
     '',
    ].join('\n');
   }

   return await getNoIndexDiff(repoRoot, fileContext.repoPath, contextLines);
  }
 } catch (error) {
  console.error('Failed to get Git diff:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Individual untracked file paths, honoring ignore rules.
 *
 * Deliberately not `--directory`: collapsed directory entries end in a slash
 * and are not valid inputs to the per-file diff helpers, so a caller would
 * silently lose every file inside a new directory. Listing files costs more
 * entries but each one is usable.
 *
 * Callers that only need this list should not pay for `getStatus`, which also
 * computes ahead/behind, diff stats, and merge state — an order of magnitude
 * more work for an answer they throw away.
 */
export async function listUntrackedPaths(directory) {
 const { repoRoot } = await createRepositoryGitContext(directory);
 const result = await runGitCommand(repoRoot, [
  'ls-files',
  '--others',
  '--exclude-standard',
 ]);
 if (!result.success) return [];
 return String(result.stdout || '')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Individual untracked file paths, honoring ignore rules.
 *
 * Deliberately not `--directory`: collapsed directory entries end in a slash
 * and are not valid inputs to the per-file diff helpers, so a caller would
 * silently lose every file inside a new directory. Listing files costs more
 * entries but each one is usable.
 *
 * Callers that only need this list should not pay for `getStatus`, which also
 * computes ahead/behind, diff stats, and merge state — an order of magnitude
 * more work for an answer they throw away.
 */
export async function listUntrackedPaths(directory) {
  const { repoRoot } = await createRepositoryGitContext(directory);
  const result = await runGitCommand(repoRoot, [
    'ls-files',
    '--others',
    '--exclude-standard',
  ]);
  if (!result.success) return [];
  return String(result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
=======
export async function listUntrackedPaths(directory: string) {
  const { repoRoot } = await createRepositoryGitContext(directory);
  const result = await runGitCommand(repoRoot, [
    'ls-files',
    '--others',
    '--exclude-standard',
  ]);
  if (!result.success) return [];
  return String(result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Diffs for untracked files, produced against an empty tree.
 *
 * `getDiff` re-resolves the repository context on every call, which costs an
 * extra `rev-parse` per file; a walkthrough of a branch with thirty new files
 * pays that thirty times. This resolves once and reuses it, with a bounded pool
 * so a repository full of new files cannot flood the process table.
 *
 * Returns one entry per input path, in order; unreadable paths yield `''`
 * rather than failing the batch.
 */
export async function getUntrackedDiffs(directory, filePaths = [], { concurrency = 8, contextLines = 3 } = {}) {
 const paths = (Array.isArray(filePaths) ? filePaths : []).filter((value) => typeof value === 'string' && value);
 if (paths.length === 0) return [];
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Diffs for untracked files, produced against an empty tree.
 *
 * `getDiff` re-resolves the repository context on every call, which costs an
 * extra `rev-parse` per file; a walkthrough of a branch with thirty new files
 * pays that thirty times. This resolves once and reuses it, with a bounded pool
 * so a repository full of new files cannot flood the process table.
 *
 * Returns one entry per input path, in order; unreadable paths yield `''`
 * rather than failing the batch.
 */
export async function getUntrackedDiffs(directory, filePaths = [], { concurrency = 8, contextLines = 3 } = {}) {
  const paths = (Array.isArray(filePaths) ? filePaths : []).filter((value) => typeof value === 'string' && value);
  if (paths.length === 0) return [];
=======
export async function getUntrackedDiffs(directory: string, filePaths: string[] = [], { concurrency = 8, contextLines = 3 } = {}) {
  const paths = (Array.isArray(filePaths) ? filePaths : []).filter((value) => isPrimitiveString(value) && value);
  if (paths.length === 0) return [];
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const { directoryPath, directoryGit, repoRoot } = await createRepositoryGitContext(directory);
 const results = new Array(paths.length).fill('');
 let cursor = 0;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const { directoryPath, directoryGit, repoRoot } = await createRepositoryGitContext(directory);
  const results = new Array(paths.length).fill('');
  let cursor = 0;
=======
  const { directoryPath, directoryGit, repoRoot } = await createRepositoryGitContext(directory);
  const results = new Array<string>(paths.length).fill('');
  let cursor = 0;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const worker = async () => {
  while (cursor < paths.length) {
   const index = cursor++;
   try {
    const fileContext = await resolveGitFileContext(directoryPath, directoryGit, paths[index], repoRoot);
    results[index] = await getNoIndexDiff(repoRoot, fileContext.repoPath, contextLines);
   } catch {
    results[index] = '';
   }
  }
 };

 await Promise.all(Array.from({ length: Math.min(concurrency, paths.length) }, worker));
 return results;
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const refResolvesToCommit = async (git, ref) => git
 .raw(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
 .then((value) => Boolean(String(value || '').trim()))
 .catch(() => false);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const refResolvesToCommit = async (git, ref) => git
  .raw(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
  .then((value) => Boolean(String(value || '').trim()))
  .catch(() => false);
=======
const refResolvesToCommit = async (git: SimpleGit, ref: string) => git
  .raw(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
  .then((value) => Boolean(String(value || '').trim()))
  .catch(() => false);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * The branch list includes remote-only branches that `ls-remote` reported but
 * the repository never fetched (#2098), so a comparison can name a ref that does
 * not exist locally: typically the base of a stacked pull request in a fresh
 * worktree. A `<remote>/<branch>` ref on a configured remote is fetched as that
 * single branch, the way `checkoutBranch` does. Anything still unresolved is
 * named plainly instead of letting git's "ambiguous argument" surface as an
 * opaque failure.
 */
async function assertRangeRefsResolve(git, repoRoot, refs) {
 for (const ref of refs) {
  if (await refResolvesToCommit(git, ref)) continue;
  const remoteRef = parseRemoteBranchRef(ref);
  const remotes = remoteRef ? await git.getRemotes().catch(() => []) : [];
  if (remoteRef && remoteRef.branch !== 'HEAD' && remotes.some((entry) => entry?.name === remoteRef.remote)) {
   // A failed fetch (offline, branch deleted on the remote) falls through to
   // the error below; a concurrent fetch of the same ref may already have won.
   await fetchRemoteBranchRef(repoRoot, remoteRef.remote, remoteRef.branch).catch(() => undefined);
   if (await refResolvesToCommit(git, ref)) continue;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * The branch list includes remote-only branches that `ls-remote` reported but
 * the repository never fetched (#2098), so a comparison can name a ref that does
 * not exist locally: typically the base of a stacked pull request in a fresh
 * worktree. A `<remote>/<branch>` ref on a configured remote is fetched as that
 * single branch, the way `checkoutBranch` does. Anything still unresolved is
 * named plainly instead of letting git's "ambiguous argument" surface as an
 * opaque failure.
 */
async function assertRangeRefsResolve(git, repoRoot, refs) {
  for (const ref of refs) {
    if (await refResolvesToCommit(git, ref)) continue;
    const remoteRef = parseRemoteBranchRef(ref);
    const remotes = remoteRef ? await git.getRemotes().catch(() => []) : [];
    if (remoteRef && remoteRef.branch !== 'HEAD' && remotes.some((entry) => entry?.name === remoteRef.remote)) {
      // A failed fetch (offline, branch deleted on the remote) falls through to
      // the error below; a concurrent fetch of the same ref may already have won.
      await fetchRemoteBranchRef(repoRoot, remoteRef.remote, remoteRef.branch).catch(() => undefined);
      if (await refResolvesToCommit(git, ref)) continue;
    }
    throw new Error(`Ref "${ref}" is not available locally. Fetch it before comparing.`);
=======
async function assertRangeRefsResolve(git: SimpleGit, repoRoot: string, refs: string[]) {
  for (const ref of refs) {
    if (await refResolvesToCommit(git, ref)) continue;
    const remoteRef = parseRemoteBranchRef(ref);
    const remotes = remoteRef ? await git.getRemotes().catch(() => []) : [];
    if (remoteRef && remoteRef.branch !== 'HEAD' && remotes.some((entry) => entry?.name === remoteRef.remote)) {
      await fetchRemoteBranchRef(repoRoot, remoteRef.remote, remoteRef.branch).catch(() => undefined);
      if (await refResolvesToCommit(git, ref)) continue;
    }
    throw new Error(`Ref "${ref}" is not available locally. Fetch it before comparing.`);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  throw new Error(`Ref "${ref}" is not available locally. Fetch it before comparing.`);
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// A private index lets git include untracked paths in the same tree comparison
// as tracked files, including a staged deletion recreated at the same path.
// Intent-to-add records only their existence; diff reads current file contents.
async function runWorkingTreeRangeDiff(context, baseRef, headRef, args, paths = []) {
 const { git, repoRoot } = context;
 const readHead = async () => {
  const commit = (await git.raw(['rev-parse', '--verify', 'HEAD'])).trim();
  const ref = (await git.raw(['symbolic-ref', '--quiet', 'HEAD'])).trim();
  return `${commit}\n${ref}`;
 };
 const startingHead = await readHead();
 const [headCommit, currentRef] = startingHead.split('\n');
 const requestedRef = (await git.raw(['rev-parse', '--verify', '--symbolic-full-name', '--end-of-options', headRef])).trim();
 if (requestedRef !== currentRef) {
  throw new Error('Working-tree comparisons require the checked-out branch. Refresh and try again.');
 }
 const mergeBase = (await git.raw(['merge-base', baseRef, headCommit])).trim();
 const readDiff = async (comparisonGit) => {
  const output = await comparisonGit.raw([...args, mergeBase, '--', ...paths]);
  if (await readHead() !== startingHead) {
   throw new Error('The checked-out branch changed during comparison. Refresh and try again.');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// A private index lets git include untracked paths in the same tree comparison
// as tracked files, including a staged deletion recreated at the same path.
// Intent-to-add records only their existence; diff reads current file contents.
// Resolves to the diff output and the merge base it was taken against.
async function runWorkingTreeRangeDiff(context, baseRef, headRef, args, paths = []) {
  const { git, repoRoot } = context;
  const readHead = async () => {
    const commit = (await git.raw(['rev-parse', '--verify', 'HEAD'])).trim();
    const ref = (await git.raw(['symbolic-ref', '--quiet', 'HEAD'])).trim();
    return `${commit}\n${ref}`;
  };
  const startingHead = await readHead();
  const [headCommit, currentRef] = startingHead.split('\n');
  const requestedRef = (await git.raw(['rev-parse', '--verify', '--symbolic-full-name', '--end-of-options', headRef])).trim();
  if (requestedRef !== currentRef) {
    throw new Error('Working-tree comparisons require the checked-out branch. Refresh and try again.');
=======
async function runWorkingTreeRangeDiff(context: RepositoryGitContext, baseRef: string, headRef: string, args: string[], paths: string[] = []) {
  const { git, repoRoot } = context;
  const readHead = async () => {
    const commit = (await git.raw(['rev-parse', '--verify', 'HEAD'])).trim();
    const ref = (await git.raw(['symbolic-ref', '--quiet', 'HEAD'])).trim();
    return `${commit}\n${ref}`;
  };
  const startingHead = await readHead();
  const [headCommit = '', currentRef] = startingHead.split('\n');
  const requestedRef = (await git.raw(['rev-parse', '--verify', '--symbolic-full-name', '--end-of-options', headRef])).trim();
  if (requestedRef !== currentRef) {
    throw new Error('Working-tree comparisons require the checked-out branch. Refresh and try again.');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
  return { output, mergeBase };
 };
 const untracked = await git.raw(['ls-files', '--others', '--exclude-standard', '-z', '--', ...paths]);
 if (!untracked) return readDiff(git);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const mergeBase = (await git.raw(['merge-base', baseRef, headCommit])).trim();
  const readDiff = async (comparisonGit) => {
    const output = await comparisonGit.raw([...args, mergeBase, '--', ...paths]);
    if (await readHead() !== startingHead) {
      throw new Error('The checked-out branch changed during comparison. Refresh and try again.');
    }
    return { output, mergeBase };
  };
  const untracked = await git.raw(['ls-files', '--others', '--exclude-standard', '-z', '--', ...paths]);
  if (!untracked) return readDiff(git);
=======
  const mergeBase = (await git.raw(['merge-base', baseRef, headCommit])).trim();
  const readDiff = async (comparisonGit: SimpleGit) => {
    const output = await comparisonGit.raw([...args, mergeBase, '--', ...paths]);
    if (await readHead() !== startingHead) {
      throw new Error('The checked-out branch changed during comparison. Refresh and try again.');
    }
    return { output, mergeBase };
  };
  const untracked = await git.raw(['--literal-pathspecs', 'ls-files', '--others', '--exclude-standard', '-z', '--', ...paths]);
  if (!untracked) return readDiff(git);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), 'openchamber-branch-diff-'));
 try {
  const indexPath = (await git.raw(['rev-parse', '--git-path', 'index'])).trim();
  const temporaryIndex = path.join(temporaryDirectory, 'index');
  await fsp.copyFile(path.resolve(repoRoot, indexPath), temporaryIndex);
  const pathspecFile = path.join(temporaryDirectory, 'paths');
  await fsp.writeFile(pathspecFile, untracked);
  const comparisonGit = await createGit(repoRoot, {
   extraEnv: { GIT_INDEX_FILE: temporaryIndex, GIT_LITERAL_PATHSPECS: '1' },
  });
  await comparisonGit.raw(['add', '--intent-to-add', '--pathspec-from-file=' + pathspecFile, '--pathspec-file-nul']);
  return await readDiff(comparisonGit);
 } finally {
  await fsp.rm(temporaryDirectory, { recursive: true, force: true });
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function getRangeDiff(directory, { base, head, path: filePath, contextLines = 3, includeWorkingTree = false } = {}) {
 const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory);
 const baseRef = typeof base === 'string' ? base.trim() : '';
 const headRef = typeof head === 'string' ? head.trim() : '';
 if (!baseRef || !headRef) {
  throw new Error('base and head are required');
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function getRangeDiff(directory, { base, head, path: filePath, contextLines = 3, includeWorkingTree = false } = {}) {
  const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory);
  const baseRef = typeof base === 'string' ? base.trim() : '';
  const headRef = typeof head === 'string' ? head.trim() : '';
  if (!baseRef || !headRef) {
    throw new Error('base and head are required');
  }
=======
export async function getRangeDiff(directory: string, { base, head, path: filePath, previousPath, contextLines = 3, includeWorkingTree = false }: RangeOptions = {}) {
  const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory);
  const baseRef = isPrimitiveString(base) ? base.trim() : '';
  const headRef = isPrimitiveString(head) ? head.trim() : '';
  if (!baseRef || !headRef) {
    throw new Error('base and head are required');
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 await assertRangeRefsResolve(git, repoRoot, [baseRef, headRef]);

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const args = ['diff', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/'];
 if (typeof contextLines === 'number' && !Number.isNaN(contextLines)) {
  args.push(`-U${Math.max(0, contextLines)}`);
 }
 const paths = [];
 if (filePath) {
  try {
   const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
   paths.push(fileContext.repoPath);
  } catch (error) {
   if (error.code !== GIT_PATH_NOT_FOUND) throw error;
   // A committed deletion is absent from HEAD, the index, and the working
   // tree. It is still a valid range path when it exists at the merge base.
   const mergeBase = (await git.raw(['merge-base', baseRef, headRef])).trim();
   for (const root of new Set([repoRoot, directoryPath])) {
    const target = path.resolve(root, filePath);
    if (!isInsideOrSameDirectory(repoRoot, target)) continue;
    const repoPath = toGitPath(path.relative(repoRoot, target));
    const exists = await git.raw(['cat-file', '-e', `${mergeBase}:${repoPath}`]).then(() => true).catch(() => false);
    if (exists) {
     paths.push(repoPath);
     break;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const args = ['diff', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/'];
  if (typeof contextLines === 'number' && !Number.isNaN(contextLines)) {
    args.push(`-U${Math.max(0, contextLines)}`);
  }
  const paths = [];
  if (filePath) {
    try {
      const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
      paths.push(fileContext.repoPath);
    } catch (error) {
      if (error.code !== GIT_PATH_NOT_FOUND) throw error;
      // A committed deletion is absent from HEAD, the index, and the working
      // tree. It is still a valid range path when it exists at the merge base.
      const mergeBase = (await git.raw(['merge-base', baseRef, headRef])).trim();
      for (const root of new Set([repoRoot, directoryPath])) {
        const target = path.resolve(root, filePath);
        if (!isInsideOrSameDirectory(repoRoot, target)) continue;
        const repoPath = toGitPath(path.relative(repoRoot, target));
        const exists = await git.raw(['cat-file', '-e', `${mergeBase}:${repoPath}`]).then(() => true).catch(() => false);
        if (exists) {
          paths.push(repoPath);
          break;
        }
      }
      if (paths.length === 0) throw error;
=======
  const args = ['--literal-pathspecs', 'diff', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/'];
  if (!Number.isNaN(contextLines)) {
    args.push(`-U${Math.max(0, contextLines)}`);
  }
  const paths = [];
  if (filePath) {
    try {
      const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
      paths.push(...[previousPath, fileContext.repoPath].filter((value): value is string => Boolean(value)));
    } catch (error) {
      if (errorField(error, 'code') !== GIT_PATH_NOT_FOUND) throw error;
      const mergeBase = (await git.raw(['merge-base', baseRef, headRef])).trim();
      for (const root of new Set([repoRoot, directoryPath])) {
        const target = path.resolve(root, filePath);
        if (!isInsideOrSameDirectory(repoRoot, target)) continue;
        const repoPath = toGitPath(path.relative(repoRoot, target));
        const exists = await git.raw(['cat-file', '-e', `${mergeBase}:${repoPath}`]).then(() => true).catch(() => false);
        if (exists) {
          paths.push(repoPath);
          break;
        }
      }
      if (paths.length === 0) throw error;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    }
   }
   if (paths.length === 0) throw error;
  }
 }
 if (includeWorkingTree) {
  return (await runWorkingTreeRangeDiff({ git, repoRoot }, baseRef, headRef, args, paths)).output;
 }
 args.push(`${baseRef}...${headRef}`, '--', ...paths);
 const diff = await git.raw(args);
 return diff;
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** A document at the merge base and at the head of a range, the checked-out files included when asked. */
export async function getRangeFileVersions(directory, { base, head, path: filePath, previousPath, includeWorkingTree = false } = {}) {
 const { directoryPath, repoRoot, git } = await createRepositoryGitContext(directory);
 const baseRef = String(base ?? '').trim();
 const headRef = String(head ?? '').trim();
 if (!baseRef || !headRef || !filePath) throw new Error('base, head and path are required');
 await assertRangeRefsResolve(git, repoRoot, [baseRef, headRef]);
 const headCommit = (await git.raw(['rev-parse', '--verify', '--end-of-options', `${headRef}^{commit}`])).trim();
 const mergeBase = (await git.raw(['merge-base', baseRef, headCommit])).trim();
 const absolutePath = path.resolve(directoryPath, filePath);
 const candidates = new Set([path.resolve(repoRoot, filePath), absolutePath]);
 const repoPaths = Array.from(candidates)
  .filter((candidate) => isInsideOrSameDirectory(repoRoot, candidate))
  .map((candidate) => toGitPath(path.relative(repoRoot, candidate)));
 const readRevision = async (revision, repoPath) => {
  try {
   const { stdout } = await execFileAsync(getGitBinary(), ['show', `${revision}:${repoPath}`], {
    cwd: repoRoot,
    encoding: 'buffer',
    windowsHide: true,
    maxBuffer: 50 * 1024 * 1024,
   });
   return stdout.length > 0 ? `data:application/octet-stream;base64,${stdout.toString('base64')}` : '';
  } catch {
   return '';
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** A document at the merge base and at the head of a range, the checked-out files included when asked. */
export async function getRangeFileVersions(directory, { base, head, path: filePath, previousPath, includeWorkingTree = false } = {}) {
  const { directoryPath, repoRoot, git } = await createRepositoryGitContext(directory);
  const baseRef = String(base ?? '').trim();
  const headRef = String(head ?? '').trim();
  if (!baseRef || !headRef || !filePath) throw new Error('base, head and path are required');
  await assertRangeRefsResolve(git, repoRoot, [baseRef, headRef]);
  const headCommit = (await git.raw(['rev-parse', '--verify', '--end-of-options', `${headRef}^{commit}`])).trim();
  const mergeBase = (await git.raw(['merge-base', baseRef, headCommit])).trim();
  const absolutePath = path.resolve(directoryPath, filePath);
  const candidates = new Set([path.resolve(repoRoot, filePath), absolutePath]);
  const repoPaths = Array.from(candidates)
    .filter((candidate) => isInsideOrSameDirectory(repoRoot, candidate))
    .map((candidate) => toGitPath(path.relative(repoRoot, candidate)));
  const readRevision = async (revision, repoPath) => {
    try {
      const { stdout } = await execFileAsync(getGitBinary(), ['show', `${revision}:${repoPath}`], {
        cwd: repoRoot,
        encoding: 'buffer',
        windowsHide: true,
        maxBuffer: 50 * 1024 * 1024,
      });
      return stdout.length > 0 ? `data:application/octet-stream;base64,${stdout.toString('base64')}` : '';
    } catch {
      return '';
    }
  };
  for (const repoPath of repoPaths) {
    // A renamed file has its old path at the merge base.
    const basePath = previousPath ? toGitPath(path.relative(repoRoot, path.resolve(path.dirname(path.join(repoRoot, repoPath)), path.relative(path.dirname(filePath), previousPath)))) : repoPath;
    const original = await readRevision(mergeBase, basePath);
    let modified = '';
    if (includeWorkingTree) {
      modified = await fsp.readFile(path.join(repoRoot, repoPath))
        .then((bytes) => `data:application/octet-stream;base64,${bytes.toString('base64')}`)
        .catch(() => '');
    } else {
      modified = await readRevision(headCommit, repoPath);
    }
    // For a rename only the new name tells which folder the paths are from.
    if (modified || (original && !previousPath)) return { original, modified };
=======
export async function getRangeFileVersions(directory: string, { base, head, path: filePath, previousPath, includeWorkingTree = false }: RangeOptions = {}) {
  const { directoryPath, repoRoot, git } = await createRepositoryGitContext(directory);
  const baseRef = String(base ?? '').trim();
  const headRef = String(head ?? '').trim();
  if (!baseRef || !headRef || !filePath) throw new Error('base, head and path are required');
  await assertRangeRefsResolve(git, repoRoot, [baseRef, headRef]);
  const headCommit = (await git.raw(['rev-parse', '--verify', '--end-of-options', `${headRef}^{commit}`])).trim();
  const mergeBase = (await git.raw(['merge-base', baseRef, headCommit])).trim();
  const absolutePath = path.resolve(directoryPath, filePath);
  const candidates = new Set([path.resolve(repoRoot, filePath), absolutePath]);
  const repoPaths = Array.from(candidates)
    .filter((candidate) => isInsideOrSameDirectory(repoRoot, candidate))
    .map((candidate) => toGitPath(path.relative(repoRoot, candidate)));
  const readRevision = async (revision: string, repoPath: string) => {
    try {
      const { stdout } = await execFileAsync(getGitBinary(), ['show', `${revision}:${repoPath}`], {
        cwd: repoRoot,
        encoding: 'buffer',
        windowsHide: true,
        maxBuffer: 50 * 1024 * 1024,
      });
      return stdout.length > 0 ? `data:application/octet-stream;base64,${stdout.toString('base64')}` : '';
    } catch {
      return '';
    }
  };
  for (const repoPath of repoPaths) {
    const basePath = previousPath ? toGitPath(path.relative(repoRoot, path.resolve(path.dirname(path.join(repoRoot, repoPath)), path.relative(path.dirname(filePath), previousPath)))) : repoPath;
    const original = await readRevision(mergeBase, basePath);
    let modified = '';
    if (includeWorkingTree) {
      modified = await fsp.readFile(path.join(repoRoot, repoPath))
        .then((bytes) => `data:application/octet-stream;base64,${bytes.toString('base64')}`)
        .catch(() => '');
    } else {
      modified = await readRevision(headCommit, repoPath);
    }
    if (modified || (original && !previousPath)) return { original, modified };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 };
 for (const repoPath of repoPaths) {
  // A renamed file has its old path at the merge base.
  const basePath = previousPath ? toGitPath(path.relative(repoRoot, path.resolve(path.dirname(path.join(repoRoot, repoPath)), path.relative(path.dirname(filePath), previousPath)))) : repoPath;
  const original = await readRevision(mergeBase, basePath);
  let modified = '';
  if (includeWorkingTree) {
   modified = await fsp.readFile(path.join(repoRoot, repoPath))
    .then((bytes) => `data:application/octet-stream;base64,${bytes.toString('base64')}`)
    .catch(() => '');
  } else {
   modified = await readRevision(headCommit, repoPath);
  }
  // For a rename only the new name tells which folder the paths are from.
  if (modified || (original && !previousPath)) return { original, modified };
 }
 return { original: '', modified: '' };
}

const BRANCH_CREATION_SOURCE_RE = /^branch: Created from (.+)$/;

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Parse a branch reflog (`git reflog show --format=%gs <branch>`) and return the
 * ref the branch was created from, when that source is itself a named ref.
 *
 * Returns null when the branch was created from `HEAD` (bare, as `git switch -c`
 * / `git checkout -b` without an explicit start point record) or a raw commit
 * (detached start): the original branch name is not recorded anywhere in that
 * case, and guessing a base from commit topology would be a heuristic, not an
 * answer. Callers should ask the user to pick a base instead.
 */
export function parseBranchCreationSource(reflogText) {
 const lines = String(reflogText || '')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
 // Rebase records its destination as a commit, not a parent branch. The
 // creation ref is no longer evidence of the current base after restacking.
 if (lines.some((line) => /^rebase(?:\s|\()/.test(line))) return null;
 // Reflog lists newest entries first; the creation entry is the oldest one.
 for (let index = lines.length - 1; index >= 0; index -= 1) {
  const match = lines[index].match(BRANCH_CREATION_SOURCE_RE);
  if (!match) continue;
  const source = match[1].trim();
  // Bare `HEAD` (`git switch -c` from the current branch) and `HEAD@{...}`
  // (detached start) both lack a named source; a raw commit hash does too.
  if (!source || /^HEAD(@|$)/.test(source) || /^[0-9a-f]{7,40}$/i.test(source)) {
   return null;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Parse a branch reflog (`git reflog show --format=%gs <branch>`) and return the
 * ref the branch was created from, when that source is itself a named ref.
 *
 * Returns null when the branch was created from `HEAD` (bare, as `git switch -c`
 * / `git checkout -b` without an explicit start point record) or a raw commit
 * (detached start): the original branch name is not recorded anywhere in that
 * case, and guessing a base from commit topology would be a heuristic, not an
 * answer. Callers should ask the user to pick a base instead.
 */
export function parseBranchCreationSource(reflogText) {
  const lines = String(reflogText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  // Rebase records its destination as a commit, not a parent branch. The
  // creation ref is no longer evidence of the current base after restacking.
  if (lines.some((line) => /^rebase(?:\s|\()/.test(line))) return null;
  // Reflog lists newest entries first; the creation entry is the oldest one.
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index].match(BRANCH_CREATION_SOURCE_RE);
    if (!match) continue;
    const source = match[1].trim();
    // Bare `HEAD` (`git switch -c` from the current branch) and `HEAD@{...}`
    // (detached start) both lack a named source; a raw commit hash does too.
    if (!source || /^HEAD(@|$)/.test(source) || /^[0-9a-f]{7,40}$/i.test(source)) {
      return null;
    }
    return source;
=======
export function parseBranchCreationSource(reflogText: string) {
  const { source, rebased } = readBranchCreation(reflogText);
  return rebased ? null : source;
}

function readBranchCreation(reflogText: string) {
  const lines = String(reflogText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const rebased = lines.some((line) => /^rebase(?:\s|\()/.test(line));
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index]?.match(BRANCH_CREATION_SOURCE_RE);
    if (!match) continue;
    const source = (match[1] ?? '').trim();
    if (!source || /^HEAD(@|$)/.test(source) || /^[0-9a-f]{7,40}$/i.test(source)) {
      return { source: null, rebased };
    }
    return { source, rebased };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
  return source;
 }
 return null;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  return null;
}

async function isOwnRemoteCopy(git, source, branchName) {
  const fullName = await git
    .raw(['rev-parse', '--symbolic-full-name', source])
    .then((value) => String(value || '').trim())
    .catch(() => '');
  if (!fullName.startsWith('refs/remotes/')) return false;
  const upstream = await git
    .raw(['rev-parse', '--symbolic-full-name', `refs/heads/${branchName}@{upstream}`])
    .then((value) => String(value || '').trim())
    .catch(() => '');
  if (upstream && fullName === upstream) return true;
  // Upstream may be unset; a remote ref with the branch's own name is still its copy.
  return fullName.slice('refs/remotes/'.length).split('/').slice(1).join('/') === branchName;
=======
  return { source: null, rebased };
}

async function isOwnRemoteCopy(git: SimpleGit, source: string, branchName: string) {
  const fullName = await git
    .raw(['rev-parse', '--symbolic-full-name', source])
    .then((value) => String(value || '').trim())
    .catch(() => '');
  if (!fullName.startsWith('refs/remotes/')) return false;
  const upstream = await git
    .raw(['rev-parse', '--symbolic-full-name', `refs/heads/${branchName}@{upstream}`])
    .then((value) => String(value || '').trim())
    .catch(() => '');
  if (upstream && fullName === upstream) return true;
  return fullName.slice('refs/remotes/'.length).split('/').slice(1).join('/') === branchName;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

const branchParentKey = (branch: string) => `branch.${branch}.gh-merge-base`;

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** The local branch `ref` names, or null for a remote ref, a commit or `HEAD`. */
async function localBranchNameOf(directory, ref) {
 const result = await runGitCommand(directory, ['rev-parse', '--symbolic-full-name', ref]);
 const fullName = String(result.stdout || '').trim();
 return result.success && fullName.startsWith('refs/heads/') ? fullName.slice('refs/heads/'.length) : null;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** The local branch `ref` names, or null for a remote ref, a commit or `HEAD`. */
async function localBranchNameOf(directory, ref) {
  const result = await runGitCommand(directory, ['rev-parse', '--symbolic-full-name', ref]);
  const fullName = String(result.stdout || '').trim();
  return result.success && fullName.startsWith('refs/heads/') ? fullName.slice('refs/heads/'.length) : null;
=======
async function localBranchNameOf(directory: string, ref: string) {
  const result = await runGitCommand(directory, ['rev-parse', '--symbolic-full-name', ref]);
  const fullName = String(result.stdout || '').trim();
  return result.success && fullName.startsWith('refs/heads/') ? fullName.slice('refs/heads/'.length) : null;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Records `parent` as the branch `branch` was made on. A failed write leaves
 * the reflog to answer, so it never fails the creation it follows.
 */
async function recordBranchParent(directory, branch, parent) {
 if (!parent || parent === branch) return;
 await runGitCommand(directory, ['config', branchParentKey(branch), parent]);
}

async function isOwnRemoteCopy(git, source, branchName) {
 const fullName = await git
  .raw(['rev-parse', '--symbolic-full-name', source])
  .then((value) => String(value || '').trim())
  .catch(() => '');
 if (!fullName.startsWith('refs/remotes/')) return false;
 const upstream = await git
  .raw(['rev-parse', '--symbolic-full-name', `refs/heads/${branchName}@{upstream}`])
  .then((value) => String(value || '').trim())
  .catch(() => '');
 if (upstream && fullName === upstream) return true;
 // Upstream may be unset; a remote ref with the branch's own name is still its copy.
 return fullName.slice('refs/remotes/'.length).split('/').slice(1).join('/') === branchName;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Records `parent` as the branch `branch` was made on. A failed write leaves
 * the reflog to answer, so it never fails the creation it follows.
 */
async function recordBranchParent(directory, branch, parent) {
  if (!parent || parent === branch) return;
  await runGitCommand(directory, ['config', branchParentKey(branch), parent]);
=======
async function recordBranchParent(directory: string, branch: string, parent: string | null) {
  if (!parent || parent === branch) return;
  await runGitCommand(directory, ['config', branchParentKey(branch), parent]);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Resolve the branch the given branch was created from, from its reflog.
 * Returns { base: null } when git has no authoritative record (clone, detached
 * start, reflog expired) — callers must not fall back to main/master.
 */
export async function getBranchBase(directory, branch) {
 const branchName = String(branch || '').trim();
 if (!branchName) {
  throw new Error('branch is required');
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Resolve the branch the given branch was made on: the parent recorded when it
 * was created (`branch.<name>.gh-merge-base`), else the creation source in its
 * reflog. Returns { base: null } when git has no authoritative record (clone,
 * detached start, reflog expired or rebased) — callers must not fall back to
 * main/master.
 */
export async function getBranchBase(directory, branch) {
  const branchName = String(branch || '').trim();
  if (!branchName) {
    throw new Error('branch is required');
  }
=======
async function findNearerStackLayer(git: SimpleGit, repoRoot: string, branchName: string, lowerRef: string) {
  const lowerCommit = await git
    .raw(['rev-parse', '--verify', '--quiet', `${lowerRef}^{commit}`])
    .then((value) => String(value || '').trim())
    .catch(() => '');
  if (!lowerCommit) return null;
  const listed = await git
    .raw(['for-each-ref', '--format=%(refname)%00%(objectname)', '--merged', `refs/heads/${branchName}`, '--contains', lowerCommit, 'refs/heads/'])
    .catch(() => '');
  const candidates = String(listed || '').split('\n').filter(Boolean)
    .map((line) => {
      const [ref = '', commit] = line.split('\0');
      return { name: ref.slice('refs/heads/'.length), commit };
    })
    .filter(({ name, commit }) => name !== branchName && commit !== lowerCommit);
  if (candidates.length === 0) return null;

  const line = String(await git
    .raw(['rev-list', '--first-parent', `${lowerCommit}..refs/heads/${branchName}`])
    .catch(() => '')).split('\n').map((value) => value.trim()).filter(Boolean);
  let lowerTips: Set<string> | null = null;
  const isOnLowerParent = async (commit: string) => {
    lowerTips ??= new Set(String(await git.raw(['reflog', 'show', '--format=%H', lowerRef]).catch(() => ''))
      .split('\n').map((value) => value.trim()).filter(Boolean));
    return lowerTips.has(commit) || (await runGitCommand(repoRoot, ['merge-base', '--is-ancestor', commit, lowerCommit])).success;
  };
  const isLowerLayer = async (name: string) => {
    const recorded = await git.raw(['config', '--get', branchParentKey(name)]).then((value) => String(value || '').trim()).catch(() => '');
    if (recorded) return recorded !== branchName;
    const entries = String(await git.raw(['reflog', 'show', '--format=%H%x00%gs', name]).catch(() => ''))
      .split('\n').filter(Boolean).map((entry) => entry.split('\0'));
    const { source } = readBranchCreation(entries.map(([, subject]) => subject).join('\n'));
    const fullName = source
      ? await git.raw(['rev-parse', '--symbolic-full-name', source]).then((value) => String(value || '').trim()).catch(() => '')
      : '';
    if (fullName.startsWith('refs/heads/')) return fullName !== `refs/heads/${branchName}`;
    if (fullName.startsWith('refs/remotes/')) return !(await isOwnRemoteCopy(git, fullName, branchName));
    const created = entries.at(-1);
    if (!created || !BRANCH_CREATION_SOURCE_RE.test(created[1] ?? '')) return false;
    return isOnLowerParent(created[0] ?? '');
  };
  for (const commit of line) {
    const named = candidates.filter((candidate) => candidate.commit === commit);
    if (named.length === 0) continue;
    const layers = [];
    for (const { name } of named) {
      if (await isLowerLayer(name)) layers.push(name);
    }
    if (layers.length > 0) return layers.length === 1 ? layers[0] : null;
  }
  return null;
}

export async function getBranchBase(directory: string, branch: string) {
  const branchName = String(branch || '').trim();
  if (!branchName) {
    throw new Error('branch is required');
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const { git } = await createRepositoryGitContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const { git } = await createRepositoryGitContext(directory);
=======
  const { git, repoRoot } = await createRepositoryGitContext(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const recordedParent = await git
  .raw(['config', '--get', branchParentKey(branchName)])
  .then((value) => String(value || '').trim())
  .catch(() => '');
 if (recordedParent && recordedParent !== branchName) {
  // The parent is often only a remote branch here (a branch made on a
  // pull request's head); a bare name its remote copy answers to still
  // names it, and callers qualify it to that copy.
  const remotes = await git.raw(['remote']).then((value) => String(value || '').split('\n').map((name) => name.trim()).filter(Boolean)).catch(() => []);
  for (const ref of [`refs/heads/${recordedParent}`, ...remotes.map((remote) => `refs/remotes/${remote}/${recordedParent}`)]) {
   const resolves = await git
    .raw(['rev-parse', '--verify', '--quiet', ref])
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const recordedParent = await git
    .raw(['config', '--get', branchParentKey(branchName)])
    .then((value) => String(value || '').trim())
    .catch(() => '');
  if (recordedParent && recordedParent !== branchName) {
    // The parent is often only a remote branch here (a branch made on a
    // pull request's head); a bare name its remote copy answers to still
    // names it, and callers qualify it to that copy.
    const remotes = await git.raw(['remote']).then((value) => String(value || '').split('\n').map((name) => name.trim()).filter(Boolean)).catch(() => []);
    for (const ref of [`refs/heads/${recordedParent}`, ...remotes.map((remote) => `refs/remotes/${remote}/${recordedParent}`)]) {
      const resolves = await git
        .raw(['rev-parse', '--verify', '--quiet', ref])
        .then((value) => Boolean(String(value || '').trim()))
        .catch(() => false);
      if (resolves) return { base: recordedParent };
    }
  }

  let reflog = '';
  try {
    reflog = await git.raw(['reflog', 'show', '--format=%gs', branchName]);
  } catch {
    return { base: null };
  }

  const source = parseBranchCreationSource(reflog);
  if (!source || source === branchName) {
    return { base: null };
  }

  const resolves = await git
    .raw(['rev-parse', '--verify', '--quiet', source])
=======
  const recordedParent = await git
    .raw(['config', '--get', branchParentKey(branchName)])
    .then((value) => String(value || '').trim())
    .catch(() => '');
  if (recordedParent && recordedParent !== branchName) {
    const remotes = await git.raw(['remote']).then((value) => String(value || '').split('\n').map((name) => name.trim()).filter(Boolean)).catch(() => []);
    for (const ref of [`refs/heads/${recordedParent}`, ...remotes.map((remote) => `refs/remotes/${remote}/${recordedParent}`)]) {
      const resolves = await git
        .raw(['rev-parse', '--verify', '--quiet', ref])
        .then((value) => Boolean(String(value || '').trim()))
        .catch(() => false);
      if (resolves) return { base: (await findNearerStackLayer(git, repoRoot, branchName, ref)) ?? recordedParent };
    }
  }

  let reflog = '';
  try {
    reflog = await git.raw(['reflog', 'show', '--format=%gs', branchName]);
  } catch {
    return { base: null };
  }

  const { source, rebased } = readBranchCreation(reflog);
  if (!source || source === branchName) {
    return { base: null };
  }

  const resolves = await git
    .raw(['rev-parse', '--verify', '--quiet', source])
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    .then((value) => Boolean(String(value || '').trim()))
    .catch(() => false);
   if (resolves) return { base: recordedParent };
  }
 }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 let reflog = '';
 try {
  reflog = await git.raw(['reflog', 'show', '--format=%gs', branchName]);
 } catch {
  return { base: null };
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  // `git switch feat` from a remote branch records "Created from
  // refs/remotes/origin/feat": the branch's own remote copy, not a parent.
  // Comparing against it hides every pushed commit.
  if (await isOwnRemoteCopy(git, source, branchName)) {
    return { base: null };
  }
=======
  if (await isOwnRemoteCopy(git, source, branchName)) {
    return { base: null };
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const source = parseBranchCreationSource(reflog);
 if (!source || source === branchName) {
  return { base: null };
 }

 const resolves = await git
  .raw(['rev-parse', '--verify', '--quiet', source])
  .then((value) => Boolean(String(value || '').trim()))
  .catch(() => false);
 if (!resolves) {
  return { base: null };
 }

 // `git switch feat` from a remote branch records "Created from
 // refs/remotes/origin/feat": the branch's own remote copy, not a parent.
 // Comparing against it hides every pushed commit.
 if (await isOwnRemoteCopy(git, source, branchName)) {
  return { base: null };
 }

 return { base: source };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  return { base: source };
=======
  const nearer = await findNearerStackLayer(git, repoRoot, branchName, source);
  if (nearer) return { base: nearer };
  return { base: rebased ? null : source };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function getRangeFiles(directory, { base, head, includeWorkingTree = false } = {}) {
 const { git, repoRoot } = await createRepositoryGitContext(directory);
 const baseRef = typeof base === 'string' ? base.trim() : '';
 const headRef = typeof head === 'string' ? head.trim() : '';
 if (!baseRef || !headRef) {
  throw new Error('base and head are required');
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function getRangeFiles(directory, { base, head, includeWorkingTree = false } = {}) {
  const { git, repoRoot } = await createRepositoryGitContext(directory);
  const baseRef = typeof base === 'string' ? base.trim() : '';
  const headRef = typeof head === 'string' ? head.trim() : '';
  if (!baseRef || !headRef) {
    throw new Error('base and head are required');
  }
=======
export async function getRangeFiles(directory: string, { base, head, includeWorkingTree = false }: RangeOptions = {}) {
  const { git, repoRoot } = await createRepositoryGitContext(directory);
  const baseRef = isPrimitiveString(base) ? base.trim() : '';
  const headRef = isPrimitiveString(head) ? head.trim() : '';
  if (!baseRef || !headRef) {
    throw new Error('base and head are required');
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 await assertRangeRefsResolve(git, repoRoot, [baseRef, headRef]);

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 // `-C` (copy detection among changed files only, so cheap) makes copies
 // surface as C entries instead of plain additions; rename detection is on
 // by default.
 const args = ['diff', '--name-status', '-z', '-C'];
 const workingTree = includeWorkingTree
  ? await runWorkingTreeRangeDiff({ git, repoRoot }, baseRef, headRef, args)
  : null;
 const raw = workingTree ? workingTree.output : await git.raw([...args, `${baseRef}...${headRef}`, '--']);
 // -z format: STATUS\0PATH\0[ORIG\0] repeated. For rename/copy entries
 // (`R100`, `C75`) the first path token is the ORIGINAL path and the second
 // is the DESTINATION — the diff (and the UI) must address the destination.
 const tokens = String(raw || '').split('\0');
 const files = [];
 for (let index = 0; index < tokens.length; index += 1) {
  const status = (tokens[index] || '').trim();
  if (!status) continue;
  const isRenameOrCopy = status.startsWith('R') || status.startsWith('C');
  const path = isRenameOrCopy ? (tokens[index + 2] || '') : (tokens[index + 1] || '');
  index += isRenameOrCopy ? 2 : 1;
  if (path) {
   files.push({ path, status: status.charAt(0) });
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  // `-C` (copy detection among changed files only, so cheap) makes copies
  // surface as C entries instead of plain additions; rename detection is on
  // by default.
  const args = ['diff', '--name-status', '-z', '-C'];
  const workingTree = includeWorkingTree
    ? await runWorkingTreeRangeDiff({ git, repoRoot }, baseRef, headRef, args)
    : null;
  const raw = workingTree ? workingTree.output : await git.raw([...args, `${baseRef}...${headRef}`, '--']);
  // -z format: STATUS\0PATH\0[ORIG\0] repeated. For rename/copy entries
  // (`R100`, `C75`) the first path token is the ORIGINAL path and the second
  // is the DESTINATION — the diff (and the UI) must address the destination.
  const tokens = String(raw || '').split('\0');
  const files = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const status = (tokens[index] || '').trim();
    if (!status) continue;
    const isRenameOrCopy = status.startsWith('R') || status.startsWith('C');
    const path = isRenameOrCopy ? (tokens[index + 2] || '') : (tokens[index + 1] || '');
    index += isRenameOrCopy ? 2 : 1;
    if (path) {
      files.push({ path, status: status.charAt(0) });
    }
=======
  const args = ['diff', '--name-status', '-z', '-C'];
  const workingTree = includeWorkingTree
    ? await runWorkingTreeRangeDiff({ git, repoRoot }, baseRef, headRef, args)
    : null;
  const raw = workingTree ? workingTree.output : await git.raw([...args, `${baseRef}...${headRef}`, '--']);
  const tokens = String(raw || '').split('\0');
  const files = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const status = (tokens[index] || '').trim();
    if (!status) continue;
    const isRenameOrCopy = status.startsWith('R') || status.startsWith('C');
    const previousPath = isRenameOrCopy ? tokens[index + 1] || undefined : undefined;
    const path = isRenameOrCopy ? (tokens[index + 2] || '') : (tokens[index + 1] || '');
    index += isRenameOrCopy ? 2 : 1;
    if (path) {
      files.push({ path, status: status.charAt(0), previousPath });
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 }
 if (!workingTree) return files;
 return Promise.all(files.map(async (file) => ({
  ...file,
  revision: `${workingTree.mergeBase}:${await readWorkingFileSignature(path.join(repoRoot, file.path))}`,
 })));
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * What a working-tree range patch of one file depends on besides the merge
 * base: the file as it is on disk. Its stat changes with every write, so the
 * Changes view re-reads a patch only when the file was written, and a status
 * refresh that changed nothing re-reads nothing. A write that keeps the size
 * and line counts still moves the timestamps. Missing reads as `missing`.
 */
async function readWorkingFileSignature(absolutePath) {
 try {
  const stat = await fsp.lstat(absolutePath, { bigint: true });
  return `${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}:${stat.mode}:${stat.ino}`;
 } catch {
  return 'missing';
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * What a working-tree range patch of one file depends on besides the merge
 * base: the file as it is on disk. Its stat changes with every write, so the
 * Changes view re-reads a patch only when the file was written, and a status
 * refresh that changed nothing re-reads nothing. A write that keeps the size
 * and line counts still moves the timestamps. Missing reads as `missing`.
 */
async function readWorkingFileSignature(absolutePath) {
  try {
    const stat = await fsp.lstat(absolutePath, { bigint: true });
    return `${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}:${stat.mode}:${stat.ino}`;
  } catch {
    return 'missing';
  }
=======
async function readWorkingFileSignature(absolutePath: string) {
  try {
    const stat = await fsp.lstat(absolutePath, { bigint: true });
    return `${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}:${stat.mode}:${stat.ino}`;
  } catch {
    return 'missing';
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif'];

const OFFICE_DOCUMENT_EXTENSIONS = ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'];


const BINARY_SNIFF_BYTES = 8192;

<<<<<<< HEAD:packages/web/server/lib/git/service.js
function isImageFile(filePath) {
 const ext = filePath.split('.').pop()?.toLowerCase();
 return IMAGE_EXTENSIONS.includes(ext || '');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
function isImageFile(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext || '');
=======
function isImageFile(filePath: string) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext || '');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// The viewer compares these itself, so a diff carries the two files.
function isOfficeDocument(filePath) {
 const ext = filePath.split('.').pop()?.toLowerCase();
 return OFFICE_DOCUMENT_EXTENSIONS.includes(ext || '');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// The viewer compares these itself, so a diff carries the two files.
function isOfficeDocument(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return OFFICE_DOCUMENT_EXTENSIONS.includes(ext || '');
=======
function isOfficeDocument(filePath: string) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return OFFICE_DOCUMENT_EXTENSIONS.includes(ext || '');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
function getImageMimeType(filePath) {
 const ext = filePath.split('.').pop()?.toLowerCase();
 const mimeMap = {
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'svg': 'image/svg+xml',
  'webp': 'image/webp',
  'ico': 'image/x-icon',
  'bmp': 'image/bmp',
  'avif': 'image/avif',
 };
 return mimeMap[ext] || 'application/octet-stream';
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
function getImageMimeType(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const mimeMap = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'bmp': 'image/bmp',
    'avif': 'image/avif',
  };
  return mimeMap[ext] || 'application/octet-stream';
=======
function getImageMimeType(filePath: string) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const mimeMap = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'bmp': 'image/bmp',
    'avif': 'image/avif',
  };
  const isMimeExtension = (value: unknown): value is keyof typeof mimeMap => isPrimitiveString(value) && Object.hasOwn(mimeMap, value);
  return isMimeExtension(ext) ? mimeMap[ext] : 'application/octet-stream';
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const parseIsBinaryFromNumstat = (raw) => {
 const text = String(raw || '').trim();
 if (!text) {
  return false;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const parseIsBinaryFromNumstat = (raw) => {
  const text = String(raw || '').trim();
  if (!text) {
    return false;
  }
=======
const parseIsBinaryFromNumstat = (raw: string | undefined) => {
  const text = String(raw || '').trim();
  if (!text) {
    return false;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 // Expected format: <added>\t<deleted>\t<path>
 const firstLine = text.split('\n').map((line) => line.trim()).find(Boolean) || '';
 const [added, deleted] = firstLine.split('\t');
 return added === '-' || deleted === '-';
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  // Expected format: <added>\t<deleted>\t<path>
  const firstLine = text.split('\n').map((line) => line.trim()).find(Boolean) || '';
  const [added, deleted] = firstLine.split('\t');
  return added === '-' || deleted === '-';
=======
  const firstLine = text.split('\n').map((line) => line.trim()).find(Boolean) || '';
  const [added, deleted] = firstLine.split('\t');
  return added === '-' || deleted === '-';
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const looksBinaryBySniff = async (absolutePath) => {
 try {
  const handle = await fsp.open(absolutePath, 'r');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const looksBinaryBySniff = async (absolutePath) => {
=======
const looksBinaryBySniff = async (absolutePath: string) => {
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  try {
   const buffer = Buffer.alloc(BINARY_SNIFF_BYTES);
   const { bytesRead } = await handle.read(buffer, 0, BINARY_SNIFF_BYTES, 0);
   if (bytesRead <= 0) {
    return false;
   }
   return buffer.subarray(0, bytesRead).includes(0);
  } finally {
   await handle.close();
  }
 } catch {
  return false;
 }
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const isBinaryDiff = async (directoryPath, filePath, staged) => {
 // Fast path: ask git for numstat. For binary, it returns "-\t-\t<path>".
 const args = ['diff', '--numstat'];
 if (staged) {
  args.push('--cached');
 }
 args.push('--', filePath);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const isBinaryDiff = async (directoryPath, filePath, staged) => {
  // Fast path: ask git for numstat. For binary, it returns "-\t-\t<path>".
  const args = ['diff', '--numstat'];
  if (staged) {
    args.push('--cached');
  }
  args.push('--', filePath);
=======
const isBinaryDiff = async (directoryPath: string, filePath: string, staged: boolean) => {
  const args = ['diff', '--numstat'];
  if (staged) {
    args.push('--cached');
  }
  args.push('--', filePath);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const result = await runGitCommand(directoryPath, args);
 if (parseIsBinaryFromNumstat(result.stdout)) {
  return true;
 }

 // Fallback for untracked files (diff output is empty): use --no-index against /dev/null
 if (!staged) {
  const tracked = await runGitCommand(directoryPath, ['ls-files', '--error-unmatch', '--', filePath]).then((r) => r.success);
  if (!tracked) {
   const noIndex = await runGitCommand(directoryPath, ['diff', '--no-index', '--numstat', '--', '/dev/null', filePath]);
   if (parseIsBinaryFromNumstat(noIndex.stdout) || parseIsBinaryFromNumstat(noIndex.stderr) || parseIsBinaryFromNumstat(noIndex.message)) {
    return true;
   }
   const text = `${noIndex.stdout || ''}\n${noIndex.stderr || ''}\n${noIndex.message || ''}`.toLowerCase();
   if (text.includes('binary files') || text.includes('git binary patch')) {
    return true;
   }
  }
 }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 return false;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  // Fallback for untracked files (diff output is empty): use --no-index against /dev/null
  if (!staged) {
    const tracked = await runGitCommand(directoryPath, ['ls-files', '--error-unmatch', '--', filePath]).then((r) => r.success);
    if (!tracked) {
      const noIndex = await runGitCommand(directoryPath, ['diff', '--no-index', '--numstat', '--', '/dev/null', filePath]);
      if (parseIsBinaryFromNumstat(noIndex.stdout) || parseIsBinaryFromNumstat(noIndex.stderr) || parseIsBinaryFromNumstat(noIndex.message)) {
        return true;
      }
      const text = `${noIndex.stdout || ''}\n${noIndex.stderr || ''}\n${noIndex.message || ''}`.toLowerCase();
      if (text.includes('binary files') || text.includes('git binary patch')) {
        return true;
      }
    }
  }

  return false;
=======
  if (!staged) {
    const tracked = await runGitCommand(directoryPath, ['ls-files', '--error-unmatch', '--', filePath]).then((r) => r.success);
    if (!tracked) {
      const noIndex = await runGitCommand(directoryPath, ['diff', '--no-index', '--numstat', '--', '/dev/null', filePath]);
      if (parseIsBinaryFromNumstat(noIndex.stdout) || parseIsBinaryFromNumstat(noIndex.stderr) || parseIsBinaryFromNumstat(noIndex.message)) {
        return true;
      }
      const text = `${noIndex.stdout || ''}\n${noIndex.stderr || ''}\n${noIndex.message || ''}`.toLowerCase();
      if (text.includes('binary files') || text.includes('git binary patch')) {
        return true;
      }
    }
  }

  return false;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function getFileDiff(directory, { path: filePath, staged = false } = {}) {
 if (!directory || !filePath) {
  throw new Error('directory and path are required for getFileDiff');
 }

 const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory);
 const isImage = isImageFile(filePath) || isOfficeDocument(filePath);
 const mimeType = isImage ? getImageMimeType(filePath) : null;
 const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
 const { absolutePath, repoPath, isSymbolicLink } = fileContext;

 if (fileContext.isSubmodule) {
  // Git's own text form of a gitlink, so a plain two-pane view still shows
  // the recorded commits; `submodule` carries what the text cannot.
  const submodule = await readSubmoduleState(repoRoot, fileContext);
  const describeCommit = (commit) => (commit ? `Subproject commit ${commit}\n` : '');
  return {
   original: describeCommit(submodule.headCommit),
   modified: describeCommit(staged ? submodule.indexCommit : submodule.worktreeCommit),
   path: filePath,
   isBinary: false,
   submodule,
  };
 }

 if (!isImage && !isSymbolicLink) {
  const isBinaryBySniff = await looksBinaryBySniff(absolutePath);
  const isBinary = isBinaryBySniff || (await isBinaryDiff(repoRoot, repoPath, staged));
  if (isBinary) {
   return {
    original: '',
    modified: '',
    path: filePath,
    isBinary: true,
   };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function getFileDiff(directory, { path: filePath, staged = false } = {}) {
  if (!directory || !filePath) {
    throw new Error('directory and path are required for getFileDiff');
=======
export async function getFileDiff(directory: string, { path: filePath, staged = false, previousPath }: DiffOptions = {}) {
  if (!directory || !filePath) {
    throw new Error('directory and path are required for getFileDiff');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 let original = '';
 try {
  if (isImage) {
   // For images, use git show with raw output and convert to base64
   try {
    // Unstaged changes start from the index, so what is staged stays out.
    const originalRevision = staged ? `HEAD:${repoPath}` : `:${repoPath}`;
    const { stdout } = await execFileAsync(getGitBinary(), ['show', originalRevision], {
     cwd: repoRoot,
     encoding: 'buffer',
     windowsHide: true,
     maxBuffer: 50 * 1024 * 1024, // 50MB max
    });
    if (stdout && stdout.length > 0) {
     original = `data:${mimeType};base64,${stdout.toString('base64')}`;
    }
   } catch {
    original = '';
   }
  } else {
   original = await git.show([`HEAD:${repoPath}`]);
  }
 } catch {
  original = '';
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory);
  const isImage = isImageFile(filePath) || isOfficeDocument(filePath);
  const mimeType = isImage ? getImageMimeType(filePath) : null;
  const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
  const { absolutePath, repoPath, isSymbolicLink } = fileContext;
=======
  const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory);
  const isImage = isImageFile(filePath) || isOfficeDocument(filePath);
  const mimeType = isImage ? getImageMimeType(filePath) : null;
  const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
  const { absolutePath, repoPath, isSymbolicLink } = fileContext;
  const originalRepoPath = previousPath || repoPath;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 let modified = '';
 try {
  if (staged) {
   if (isImage) {
    const { stdout } = await execFileAsync(getGitBinary(), ['show', `:${repoPath}`], {
     cwd: repoRoot,
     encoding: 'buffer',
     windowsHide: true,
     maxBuffer: 50 * 1024 * 1024,
    });
    if (stdout && stdout.length > 0) {
     modified = `data:${mimeType};base64,${stdout.toString('base64')}`;
    }
   } else {
    modified = await git.show([`:${repoPath}`]);
   }
  } else {
   if (isSymbolicLink) {
    modified = await fsp.readlink(absolutePath);
   } else {
    const stat = await fsp.stat(absolutePath);
    if (!stat.isFile()) {
     return {
      original: typeof original === 'string' ? original.replace(/\r\n/g, '\n') : original,
      modified: '',
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  if (fileContext.isSubmodule) {
    // Git's own text form of a gitlink, so a plain two-pane view still shows
    // the recorded commits; `submodule` carries what the text cannot.
    const submodule = await readSubmoduleState(repoRoot, fileContext);
    const describeCommit = (commit) => (commit ? `Subproject commit ${commit}\n` : '');
    return {
      original: describeCommit(submodule.headCommit),
      modified: describeCommit(staged ? submodule.indexCommit : submodule.worktreeCommit),
=======
  if (fileContext.isSubmodule) {
    const submodule = await readSubmoduleState(repoRoot, fileContext);
    const describeCommit = (commit: string | null) => (commit ? `Subproject commit ${commit}\n` : '');
    return {
      original: describeCommit(submodule.headCommit),
      modified: describeCommit(staged ? submodule.indexCommit : submodule.worktreeCommit),
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
      path: filePath,
      isBinary: false,
     };
    }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
    if (isImage) {
     // For images, read as binary and convert to data URL
     const buffer = await fsp.readFile(absolutePath);
     modified = `data:${mimeType};base64,${buffer.toString('base64')}`;
    } else {
     modified = await fsp.readFile(absolutePath, 'utf8');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  }

  let original = '';
  try {
    if (isImage) {
      // For images, use git show with raw output and convert to base64
      try {
        // Unstaged changes start from the index, so what is staged stays out.
        const originalRevision = staged ? `HEAD:${repoPath}` : `:${repoPath}`;
        const { stdout } = await execFileAsync(getGitBinary(), ['show', originalRevision], {
          cwd: repoRoot,
          encoding: 'buffer',
          windowsHide: true,
          maxBuffer: 50 * 1024 * 1024, // 50MB max
        });
        if (stdout && stdout.length > 0) {
          original = `data:${mimeType};base64,${stdout.toString('base64')}`;
        }
      } catch {
        original = '';
      }
    } else {
      original = await git.show([`HEAD:${repoPath}`]);
=======
  }

  const originalRevisions = staged
    ? [`HEAD:${originalRepoPath}`]
    : [...new Set([`:${repoPath}`, `:${originalRepoPath}`, `HEAD:${originalRepoPath}`])];
  let original = '';
  for (const revision of originalRevisions) {
    try {
      if (isImage) {
        const { stdout } = await execFileAsync(getGitBinary(), ['show', revision], {
          cwd: repoRoot,
          encoding: 'buffer',
          windowsHide: true,
          maxBuffer: 50 * 1024 * 1024,
        });
        if (stdout && stdout.length > 0) {
          original = `data:${mimeType};base64,${stdout.toString('base64')}`;
          break;
        }
      } else {
        original = await git.show([revision]);
        break;
      }
    } catch {
      void 0;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
   }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  } catch {
    original = '';
=======
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
 } catch (error) {
  if (error && typeof error === 'object' && error.code === 'ENOENT') {
   modified = '';
  } else {
   console.error('Failed to read modified file contents for diff:', error);
   throw error;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js

  let modified = '';
  try {
    if (staged) {
      if (isImage) {
        const { stdout } = await execFileAsync(getGitBinary(), ['show', `:${repoPath}`], {
          cwd: repoRoot,
          encoding: 'buffer',
          windowsHide: true,
          maxBuffer: 50 * 1024 * 1024,
        });
        if (stdout && stdout.length > 0) {
          modified = `data:${mimeType};base64,${stdout.toString('base64')}`;
        }
      } else {
        modified = await git.show([`:${repoPath}`]);
      }
    } else {
      if (isSymbolicLink) {
        modified = await fsp.readlink(absolutePath);
      } else {
        const stat = await fsp.stat(absolutePath);
        if (!stat.isFile()) {
          return {
            original: typeof original === 'string' ? original.replace(/\r\n/g, '\n') : original,
            modified: '',
            path: filePath,
            isBinary: false,
          };
        }
        if (isImage) {
          // For images, read as binary and convert to data URL
          const buffer = await fsp.readFile(absolutePath);
          modified = `data:${mimeType};base64,${buffer.toString('base64')}`;
        } else {
          modified = await fsp.readFile(absolutePath, 'utf8');
        }
      }
    }
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      modified = '';
    } else {
      console.error('Failed to read modified file contents for diff:', error);
      throw error;
    }
=======

  let modified = '';
  try {
    if (staged) {
      if (isImage) {
        const { stdout } = await execFileAsync(getGitBinary(), ['show', `:${repoPath}`], {
          cwd: repoRoot,
          encoding: 'buffer',
          windowsHide: true,
          maxBuffer: 50 * 1024 * 1024,
        });
        if (stdout && stdout.length > 0) {
          modified = `data:${mimeType};base64,${stdout.toString('base64')}`;
        }
      } else {
        modified = await git.show([`:${repoPath}`]);
      }
    } else {
      if (isSymbolicLink) {
        modified = await fsp.readlink(absolutePath);
      } else {
        const stat = await fsp.stat(absolutePath);
        if (!stat.isFile()) {
          return {
            original: original.replace(/\r\n/g, '\n'),
            modified: '',
            path: filePath,
            isBinary: false,
          };
        }
        if (isImage) {
          const buffer = await fsp.readFile(absolutePath);
          modified = `data:${mimeType};base64,${buffer.toString('base64')}`;
        } else {
          modified = await fsp.readFile(absolutePath, 'utf8');
        }
      }
    }
  } catch (error) {
    if (error && isObjectValue(error) && errorField(error, 'code') === 'ENOENT') {
      modified = '';
    } else {
      console.error('Failed to read modified file contents for diff:', error);
      throw error;
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 return {
  original: typeof original === 'string' ? original.replace(/\r\n/g, '\n') : original,
  modified: typeof modified === 'string' ? modified.replace(/\r\n/g, '\n') : modified,
  path: filePath,
  isBinary: false,
 };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  return {
    original: typeof original === 'string' ? original.replace(/\r\n/g, '\n') : original,
    modified: typeof modified === 'string' ? modified.replace(/\r\n/g, '\n') : modified,
    path: filePath,
    isBinary: false,
  };
=======
  return {
    original: original.replace(/\r\n/g, '\n'),
    modified: modified.replace(/\r\n/g, '\n'),
    path: filePath,
    isBinary: false,
  };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function revertFile(directory, filePath, options = {}) {
 return withGitIndexMutationQueue(directory, async () => {
  const scope = options?.scope === 'working' ? 'working' : 'all';
  const directoryPath = normalizeDirectoryPath(directory);
  const directoryGit = await createGit(directoryPath);
  const repoRoot = await resolveGitRepositoryRoot(directoryPath, directoryGit);
  const { absolutePath, repoPath } = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
  const git = await createGit(repoRoot);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function revertFile(directory, filePath, options = {}) {
  return withGitIndexMutationQueue(directory, async () => {
    const scope = options?.scope === 'working' ? 'working' : 'all';
    const directoryPath = normalizeDirectoryPath(directory);
    const directoryGit = await createGit(directoryPath);
    const repoRoot = await resolveGitRepositoryRoot(directoryPath, directoryGit);
    const { absolutePath, repoPath } = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
    const git = await createGit(repoRoot);
=======
export async function revertFile(directory: string, filePath: string, options: { scope?: unknown } = {}) {
  return withGitIndexMutationQueue(directory, async () => {
    const scope = options?.scope === 'working' ? 'working' : 'all';
    const directoryPath = normalizeDirectoryPath(directory);
    const directoryGit = await createGit(directoryPath);
    const repoRoot = await resolveGitRepositoryRoot(directoryPath, directoryGit);
    const { absolutePath, repoPath } = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
    const git = await createGit(repoRoot);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  const isTracked = await git
   .raw(['ls-files', '--error-unmatch', '--', repoPath])
   .then(() => true)
   .catch(() => false);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    const isTracked = await git
      .raw(['ls-files', '--error-unmatch', '--', repoPath])
      .then(() => true)
      .catch(() => false);

    if (!isTracked) {
      try {
        await git.raw(['clean', '-f', '-d', '--', repoPath]);
        return;
      } catch (cleanError) {
        try {
          await fsp.rm(absolutePath, { recursive: true, force: true });
          return;
        } catch (fsError) {
          if (fsError && typeof fsError === 'object' && fsError.code === 'ENOENT') {
            return;
          }
          console.error('Failed to remove untracked file during revert:', fsError);
          throw fsError;
        }
      }
    }

    if (scope === 'all') {
      try {
        await git.raw(['restore', '--staged', '--', repoPath]);
      } catch (error) {
        await git.raw(['reset', 'HEAD', '--', repoPath]).catch(() => {});
      }
    }
=======
    const isTracked = await git
      .raw(['ls-files', '--error-unmatch', '--', repoPath])
      .then(() => true)
      .catch(() => false);

    if (!isTracked) {
      try {
        await git.raw(['clean', '-f', '-d', '--', repoPath]);
        return;
      } catch {
        try {
          await fsp.rm(absolutePath, { recursive: true, force: true });
          return;
        } catch (fsError) {
          if (fsError && isObjectValue(fsError) && errorField(fsError, 'code') === 'ENOENT') {
            return;
          }
          console.error('Failed to remove untracked file during revert:', fsError);
          throw fsError;
        }
      }
    }

    if (scope === 'all') {
      try {
        await git.raw(['restore', '--staged', '--', repoPath]);
      } catch {
        await git.raw(['reset', 'HEAD', '--', repoPath]).catch(() => {});
      }
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

  if (!isTracked) {
   try {
    await git.raw(['clean', '-f', '-d', '--', repoPath]);
    return;
   } catch (cleanError) {
    try {
<<<<<<< HEAD:packages/web/server/lib/git/service.js
     await fsp.rm(absolutePath, { recursive: true, force: true });
     return;
    } catch (fsError) {
     if (fsError && typeof fsError === 'object' && fsError.code === 'ENOENT') {
      return;
     }
     console.error('Failed to remove untracked file during revert:', fsError);
     throw fsError;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
      await git.raw(['restore', '--', repoPath]);
    } catch (error) {
      try {
        await git.raw(['checkout', '--', repoPath]);
      } catch (fallbackError) {
        console.error('Failed to revert git file:', fallbackError);
        throw fallbackError;
      }
=======
      await git.raw(['restore', '--', repoPath]);
    } catch {
      try {
        await git.raw(['checkout', '--', repoPath]);
      } catch (fallbackError) {
        console.error('Failed to revert git file:', fallbackError);
        throw fallbackError;
      }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    }
   }
  }

  if (scope === 'all') {
   try {
    await git.raw(['restore', '--staged', '--', repoPath]);
   } catch (error) {
    await git.raw(['reset', 'HEAD', '--', repoPath]).catch(() => { });
   }
  }

  try {
   await git.raw(['restore', '--', repoPath]);
  } catch (error) {
   try {
    await git.raw(['checkout', '--', repoPath]);
   } catch (fallbackError) {
    console.error('Failed to revert git file:', fallbackError);
    throw fallbackError;
   }
  }
 });
}

const HUNK_ACTION_FLAGS = {
<<<<<<< HEAD:packages/web/server/lib/git/service.js
 stage: ['--cached'],
 unstage: ['--cached', '--reverse'],
 discard: ['--reverse'],
};
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  stage: ['--cached'],
  unstage: ['--cached', '--reverse'],
  discard: ['--reverse'],
};
=======
  stage: ['--cached'],
  unstage: ['--cached', '--reverse'],
  discard: ['--reverse'],
} satisfies Record<HunkAction, string[]>;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const parsePatchPathToken = (line) => {
 const value = String(line || '').replace(/^(?:-{3}|\+{3})\s+/, '');
 if (!value || value === '/dev/null') {
  return null;
 }

 if (value.startsWith('"')) {
  let token = '"';
  let escaped = false;
  for (let index = 1; index < value.length; index += 1) {
   const char = value[index];
   token += char;
   if (escaped) {
    escaped = false;
   } else if (char === '\\') {
    escaped = true;
   } else if (char === '"') {
    break;
   }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const parsePatchPathToken = (line) => {
  const value = String(line || '').replace(/^(?:-{3}|\+{3})\s+/, '');
  if (!value || value === '/dev/null') {
    return null;
=======
const parsePatchPathToken = (line: string): string | null => {
  const value = String(line || '').replace(/^(?:-{3}|\+{3})\s+/, '');
  if (!value || value === '/dev/null') {
    return null;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  try {
   return JSON.parse(token);
  } catch {
   return token.slice(1, token.endsWith('"') ? -1 : undefined);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  if (value.startsWith('"')) {
    let token = '"';
    let escaped = false;
    for (let index = 1; index < value.length; index += 1) {
      const char = value[index];
      token += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        break;
      }
    }

    try {
      return JSON.parse(token);
    } catch {
      return token.slice(1, token.endsWith('"') ? -1 : undefined);
    }
=======
  if (value.startsWith('"')) {
    let token = '"';
    let escaped = false;
    for (let index = 1; index < value.length; index += 1) {
      const char = value[index];
      token += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        break;
      }
    }

    try {
      const parsed: unknown = JSON.parse(token);
      if (isPrimitiveString(parsed)) return parsed;
      throw new TypeError('Invalid quoted patch path');
    } catch {
      return token.slice(1, token.endsWith('"') ? -1 : undefined);
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 }

 return value.split('\t', 1)[0] || null;
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const normalizePatchTargetPath = (value) => {
 if (!value || value === '/dev/null') {
  return null;
 }
 return value.replace(/^[ab]\//, '');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const normalizePatchTargetPath = (value) => {
  if (!value || value === '/dev/null') {
    return null;
  }
  return value.replace(/^[ab]\//, '');
=======
const normalizePatchTargetPath = (value: string | null) => {
  if (!value || value === '/dev/null') {
    return null;
  }
  return value.replace(/^[ab]\//, '');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const extractPatchTargetPath = (patch) => {
 const firstHunk = patch.search(/^@@\s/m);
 const header = firstHunk < 0 ? patch : patch.slice(0, firstHunk);
 const matches = [...header.matchAll(/^(?:-{3}|\+{3})\s+.+$/gm)];
 const realTargets = matches
  .map((match) => normalizePatchTargetPath(parsePatchPathToken(match[0])))
  .filter(Boolean);
 return realTargets.at(-1) || null;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const extractPatchTargetPath = (patch) => {
  const firstHunk = patch.search(/^@@\s/m);
  const header = firstHunk < 0 ? patch : patch.slice(0, firstHunk);
  const matches = [...header.matchAll(/^(?:-{3}|\+{3})\s+.+$/gm)];
  const realTargets = matches
    .map((match) => normalizePatchTargetPath(parsePatchPathToken(match[0])))
    .filter(Boolean);
  return realTargets.at(-1) || null;
=======
const extractPatchTargetPath = (patch: string) => {
  const firstHunk = patch.search(/^@@\s/m);
  const header = firstHunk < 0 ? patch : patch.slice(0, firstHunk);
  const matches = [...header.matchAll(/^(?:-{3}|\+{3})\s+.+$/gm)];
  const realTargets = matches
    .map((match) => normalizePatchTargetPath(parsePatchPathToken(match[0])))
    .filter(Boolean);
  return realTargets.at(-1) || null;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const writeTempPatchFile = async (patch) => {
 const tmpDir = os.tmpdir();
 const tmpPath = path.join(tmpDir, `openchamber-hunk-${Date.now()}-${Math.random().toString(36).slice(2)}.patch`);
 await fsp.writeFile(tmpPath, patch, 'utf8');
 return tmpPath;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const writeTempPatchFile = async (patch) => {
  const tmpDir = os.tmpdir();
  const tmpPath = path.join(tmpDir, `openchamber-hunk-${Date.now()}-${Math.random().toString(36).slice(2)}.patch`);
  await fsp.writeFile(tmpPath, patch, 'utf8');
  return tmpPath;
=======
const writeTempPatchFile = async (patch: string) => {
  const tmpDir = os.tmpdir();
  const tmpPath = path.join(tmpDir, `openchamber-hunk-${Date.now()}-${Math.random().toString(36).slice(2)}.patch`);
  await fsp.writeFile(tmpPath, patch, 'utf8');
  return tmpPath;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function applyHunk(directory, filePath, options = {}) {
 const action = options?.action;
 if (!action || !HUNK_ACTION_FLAGS[action]) {
  throw new Error('Invalid hunk action');
 }
 const patch = typeof options?.patch === 'string' ? options.patch : '';
 if (!patch.trim()) {
  throw new Error('patch is required to apply a hunk');
 }
 if (!/^@@\s/m.test(patch)) {
  throw new Error('patch does not contain a hunk header');
 }

 return withGitIndexMutationQueue(directory, async () => {
  const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory);
  const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
  validateRepositoryFilePaths(repoRoot, [fileContext.repoPath]);

  // Applicability alone is insufficient: a previously staged or committed
  // hunk may still reverse cleanly against the working tree. Accept only a
  // canonical hunk from this file's current working/index diff.
  const current = await getDiff(directory, { path: filePath, staged: action === 'unstage', contextLines: 3 });
  const starts = [...current.matchAll(/^@@\s/gm)].map((match) => match.index);
  const header = current.slice(0, starts[0] ?? 0);
  const isCurrentHunk = starts.some((start, index) => (
   header + current.slice(start, starts[index + 1] ?? current.length) === patch
  ));
  if (!isCurrentHunk) {
   const targetPath = extractPatchTargetPath(patch);
   if (targetPath && targetPath !== fileContext.repoPath && targetPath !== filePath) {
    throw new Error('patch target path does not match the requested file');
   }
   throw new Error('Hunk no longer applies — refresh and try again.');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function applyHunk(directory, filePath, options = {}) {
  const action = options?.action;
  if (!action || !HUNK_ACTION_FLAGS[action]) {
    throw new Error('Invalid hunk action');
  }
  const patch = typeof options?.patch === 'string' ? options.patch : '';
  if (!patch.trim()) {
    throw new Error('patch is required to apply a hunk');
  }
  if (!/^@@\s/m.test(patch)) {
    throw new Error('patch does not contain a hunk header');
=======
export async function applyHunk(directory: string, filePath: string, options: { action?: HunkAction; patch?: string } = {}) {
  const action = options?.action;
  if (!action || !HUNK_ACTION_FLAGS[action]) {
    throw new Error('Invalid hunk action');
  }
  const patch = isPrimitiveString(options?.patch) ? options.patch : '';
  if (!patch.trim()) {
    throw new Error('patch is required to apply a hunk');
  }
  if (!/^@@\s/m.test(patch)) {
    throw new Error('patch does not contain a hunk header');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

  const flags = HUNK_ACTION_FLAGS[action];
  let tmpPath = null;
  try {
   tmpPath = await writeTempPatchFile(patch);

<<<<<<< HEAD:packages/web/server/lib/git/service.js
   try {
    await git.raw(['apply', ...flags, '--check', tmpPath]);
   } catch (checkError) {
    const text = parseGitErrorText(checkError);
    throw new Error(
     text
      ? `Hunk no longer applies — refresh and try again.\n${text}`
      : 'Hunk no longer applies — refresh and try again.'
    );
   }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    // Applicability alone is insufficient: a previously staged or committed
    // hunk may still reverse cleanly against the working tree. Accept only a
    // canonical hunk from this file's current working/index diff.
    const current = await getDiff(directory, { path: filePath, staged: action === 'unstage', contextLines: 3 });
    const starts = [...current.matchAll(/^@@\s/gm)].map((match) => match.index);
    const header = current.slice(0, starts[0] ?? 0);
    const isCurrentHunk = starts.some((start, index) => (
      header + current.slice(start, starts[index + 1] ?? current.length) === patch
    ));
    if (!isCurrentHunk) {
      const targetPath = extractPatchTargetPath(patch);
      if (targetPath && targetPath !== fileContext.repoPath && targetPath !== filePath) {
        throw new Error('patch target path does not match the requested file');
      }
      throw new Error('Hunk no longer applies — refresh and try again.');
    }
=======
    const current = await getDiff(directory, { path: filePath, staged: action === 'unstage', contextLines: 3 });
    const starts = [...current.matchAll(/^@@\s/gm)].map((match) => match.index);
    const header = current.slice(0, starts[0] ?? 0);
    const isCurrentHunk = starts.some((start, index) => (
      header + current.slice(start, starts[index + 1] ?? current.length) === patch
    ));
    if (!isCurrentHunk) {
      const targetPath = extractPatchTargetPath(patch);
      if (targetPath && targetPath !== fileContext.repoPath && targetPath !== filePath) {
        throw new Error('patch target path does not match the requested file');
      }
      throw new Error('Hunk no longer applies — refresh and try again.');
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

   await git.raw(['apply', ...flags, tmpPath]);
  } finally {
   if (tmpPath) {
    await fsp.rm(tmpPath, { force: true }).catch(() => { });
   }
  }
 });
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
async function collectDiffs(directory, files = []) {
 const results = [];
 for (const filePath of files) {
  try {
   const diff = await getDiff(directory, { path: filePath });
   if (diff && diff.trim().length > 0) {
    results.push({ path: filePath, diff });
   }
  } catch (error) {
   console.error(`Failed to diff ${filePath}:`, error);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
async function collectDiffs(directory, files = []) {
  const results = [];
  for (const filePath of files) {
    try {
      const diff = await getDiff(directory, { path: filePath });
      if (diff && diff.trim().length > 0) {
        results.push({ path: filePath, diff });
      }
    } catch (error) {
      console.error(`Failed to diff ${filePath}:`, error);
    }
=======
async function _collectDiffs(directory: string, files: string[] = []) {
  const results = [];
  for (const filePath of files) {
    try {
      const diff = await getDiff(directory, { path: filePath });
      if (diff && diff.trim().length > 0) {
        results.push({ path: filePath, diff });
      }
    } catch (error) {
      console.error(`Failed to diff ${filePath}:`, error);
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 }
 return results;
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function listStashes(directory) {
 const { git } = await createRepositoryGitContext(directory);
 const output = await git.raw(['stash', 'list', '--format=%gd%x1f%gs%x1f%cr%x1f%H']);
 return String(output || '')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
   const [ref = '', message = '', relativeTime = '', hash = ''] = line.split('\x1f');
   return { ref, message, relativeTime, hash };
  })
  .filter((entry) => entry.ref);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function listStashes(directory) {
  const { git } = await createRepositoryGitContext(directory);
  const output = await git.raw(['stash', 'list', '--format=%gd%x1f%gs%x1f%cr%x1f%H']);
  return String(output || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [ref = '', message = '', relativeTime = '', hash = ''] = line.split('\x1f');
      return { ref, message, relativeTime, hash };
    })
    .filter((entry) => entry.ref);
=======
export async function listStashes(directory: string) {
  const { git } = await createRepositoryGitContext(directory);
  const output = await git.raw(['stash', 'list', '--format=%gd%x1f%gs%x1f%cr%x1f%H']);
  return String(output || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [ref = '', message = '', relativeTime = '', hash = ''] = line.split('\x1f');
      return { ref, message, relativeTime, hash };
    })
    .filter((entry) => entry.ref);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function countStashFiles(directory, refs = []) {
 const { git } = await createRepositoryGitContext(directory);
 const uniqueRefs = Array.from(new Set((Array.isArray(refs) ? refs : []).map((ref) => String(ref || '').trim()).filter(Boolean)));
 const counts = {};
 const concurrency = 4;
 let cursor = 0;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function countStashFiles(directory, refs = []) {
  const { git } = await createRepositoryGitContext(directory);
  const uniqueRefs = Array.from(new Set((Array.isArray(refs) ? refs : []).map((ref) => String(ref || '').trim()).filter(Boolean)));
  const counts = {};
  const concurrency = 4;
  let cursor = 0;
=======
export async function countStashFiles<Refs>(directory: string, refs?: Refs) {
  const { git } = await createRepositoryGitContext(directory);
  const uniqueRefs = Array.from(new Set((Array.isArray(refs) ? refs : []).map((ref) => String(ref || '').trim()).filter(Boolean)));
  const counts: Record<string, number> = {};
  const concurrency = 4;
  let cursor = 0;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const worker = async () => {
  while (cursor < uniqueRefs.length) {
   const ref = uniqueRefs[cursor++];
   if (!ref) continue;
   try {
    const names = await git.raw(['stash', 'show', '--name-only', ref]);
    counts[ref] = String(names || '').split('\n').map((line) => line.trim()).filter(Boolean).length;
   } catch {
    counts[ref] = 0;
   }
  }
 };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const worker = async () => {
    while (cursor < uniqueRefs.length) {
      const ref = uniqueRefs[cursor++];
      if (!ref) continue;
      try {
        const names = await git.raw(['stash', 'show', '--name-only', ref]);
        counts[ref] = String(names || '').split('\n').map((line) => line.trim()).filter(Boolean).length;
      } catch {
        counts[ref] = 0;
      }
    }
  };
=======
  const worker = async () => {
    while (cursor < uniqueRefs.length) {
      const ref = uniqueRefs[cursor++];
      if (!ref) continue;
      try {
        const names = await git.raw(['stash', 'show', '--include-untracked', '--name-only', ref]);
        counts[ref] = String(names || '').split('\n').map((line) => line.trim()).filter(Boolean).length;
      } catch {
        counts[ref] = 0;
      }
    }
  };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 await Promise.all(Array.from({ length: Math.min(concurrency, uniqueRefs.length) }, () => worker()));
 return counts;
}
<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function stashPush(directory, options = {}) {
 const { git } = await createRepositoryGitContext(directory);
 const message = typeof options.message === 'string' && options.message.trim()
  ? options.message.trim()
  : `OhPiChamber stash ${new Date().toISOString()}`;
 // Named paths are taken literally, so a name like `*.ts` matches only itself.
 const paths = Array.isArray(options.paths) ? options.paths : [];
 const output = await git.raw(paths.length > 0
  ? ['--literal-pathspecs', 'stash', 'push', '--include-untracked', '-m', message, '--', ...paths]
  : ['stash', 'push', '--include-untracked', '-m', message]);
 return {
  success: true,
  created: !/no local changes/i.test(String(output || '')),
  message,
  output: String(output || '').trim(),
 };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function stashPush(directory, options = {}) {
  const { git } = await createRepositoryGitContext(directory);
  const message = typeof options.message === 'string' && options.message.trim()
    ? options.message.trim()
    : `OpenChamber stash ${new Date().toISOString()}`;
  // Named paths are taken literally, so a name like `*.ts` matches only itself.
  const paths = Array.isArray(options.paths) ? options.paths : [];
  const output = await git.raw(paths.length > 0
    ? ['--literal-pathspecs', 'stash', 'push', '--include-untracked', '-m', message, '--', ...paths]
    : ['stash', 'push', '--include-untracked', '-m', message]);
  return {
    success: true,
    created: !/no local changes/i.test(String(output || '')),
    message,
    output: String(output || '').trim(),
  };
=======
export async function stashPush(directory: string, options: { message?: unknown; paths?: unknown } = {}) {
  const { git } = await createRepositoryGitContext(directory);
  const message = isPrimitiveString(options.message) && options.message.trim()
    ? options.message.trim()
    : `OpenChamber stash ${new Date().toISOString()}`;
  const paths = Array.isArray(options.paths) ? options.paths : [];
  const output = await git.raw(paths.length > 0
    ? ['--literal-pathspecs', 'stash', 'push', '--include-untracked', '-m', message, '--', ...paths]
    : ['stash', 'push', '--include-untracked', '-m', message]);
  return {
    success: true,
    created: !/no local changes/i.test(String(output || '')),
    message,
    output: String(output || '').trim(),
  };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function stashApply(directory, options = {}) {
 const { git } = await createRepositoryGitContext(directory);
 const ref = typeof options.ref === 'string' && options.ref.trim() ? options.ref.trim() : 'stash@{0}';
 // Prefer --index so the staged/unstaged split captured in the stash is restored
 // faithfully. Fall back to a plain apply when the index can't be reinstated
 // cleanly (e.g. conflicts), which is the prior behavior.
 await git.raw(['stash', 'apply', '--index', ref]).catch(async () => {
  await git.raw(['stash', 'apply', ref]);
 });
 return { success: true, ref };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function stashApply(directory, options = {}) {
  const { git } = await createRepositoryGitContext(directory);
  const ref = typeof options.ref === 'string' && options.ref.trim() ? options.ref.trim() : 'stash@{0}';
  // Prefer --index so the staged/unstaged split captured in the stash is restored
  // faithfully. Fall back to a plain apply when the index can't be reinstated
  // cleanly (e.g. conflicts), which is the prior behavior.
  await git.raw(['stash', 'apply', '--index', ref]).catch(async () => {
    await git.raw(['stash', 'apply', ref]);
  });
  return { success: true, ref };
=======
export async function stashApply(directory: string, options: { ref?: unknown } = {}) {
  const { git } = await createRepositoryGitContext(directory);
  const ref = isPrimitiveString(options.ref) && options.ref.trim() ? options.ref.trim() : 'stash@{0}';
  await git.raw(['stash', 'apply', '--index', ref]).catch(async () => {
    await git.raw(['stash', 'apply', ref]);
  });
  return { success: true, ref };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function stashDrop(directory, options = {}) {
 const { git } = await createRepositoryGitContext(directory);
 const ref = typeof options.ref === 'string' && options.ref.trim() ? options.ref.trim() : 'stash@{0}';
 await git.raw(['stash', 'drop', ref]);
 return { success: true, ref };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function stashDrop(directory, options = {}) {
  const { git } = await createRepositoryGitContext(directory);
  const ref = typeof options.ref === 'string' && options.ref.trim() ? options.ref.trim() : 'stash@{0}';
  await git.raw(['stash', 'drop', ref]);
  return { success: true, ref };
=======
export async function stashDrop(directory: string, options: { ref?: unknown } = {}) {
  const { git } = await createRepositoryGitContext(directory);
  const ref = isPrimitiveString(options.ref) && options.ref.trim() ? options.ref.trim() : 'stash@{0}';
  await git.raw(['stash', 'drop', ref]);
  return { success: true, ref };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function stashPop(directory, options = {}) {
 const ref = typeof options.ref === 'string' && options.ref.trim() ? options.ref.trim() : 'stash@{0}';
 await stashApply(directory, { ref });
 await stashDrop(directory, { ref });
 return { success: true, ref };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function stashPop(directory, options = {}) {
  const ref = typeof options.ref === 'string' && options.ref.trim() ? options.ref.trim() : 'stash@{0}';
  await stashApply(directory, { ref });
  await stashDrop(directory, { ref });
  return { success: true, ref };
=======
export async function stashPop(directory: string, options: { ref?: unknown } = {}) {
  const ref = isPrimitiveString(options.ref) && options.ref.trim() ? options.ref.trim() : 'stash@{0}';
  await stashApply(directory, { ref });
  await stashDrop(directory, { ref });
  return { success: true, ref };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
async function stageFile(directory, filePath) {
 await stageFiles(directory, [filePath]);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
async function stageFile(directory, filePath) {
  await stageFiles(directory, [filePath]);
=======
async function _stageFile(directory: string, filePath: string) {
  await stageFiles(directory, [filePath]);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function stageFiles(directory, paths) {
 if (!directory) {
  throw new Error('directory and path are required for stageFile');
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function stageFiles(directory, paths) {
  if (!directory) {
    throw new Error('directory and path are required for stageFile');
  }
=======
export async function stageFiles<Paths>(directory: string, paths: Paths) {
  if (!directory) {
    throw new Error('directory and path are required for stageFile');
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const filePaths = normalizeFilePathList(paths);
 if (filePaths.length === 0) {
  throw new Error('directory and path are required for stageFile');
 }
 validateRepositoryFilePaths(normalizeDirectoryPath(directory), filePaths);

 await withGitIndexMutationQueue(directory, async () => {
  const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory);
  const repoPaths = Array.from(new Set(await Promise.all(filePaths.map(async (filePath) => {
   const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
   return fileContext.repoPath;
  }))));
  validateRepositoryFilePaths(repoRoot, repoPaths);
  await git.raw(['add', '--', ...repoPaths]).catch(async (error) => {
   const gitErrorText = parseGitErrorText(error);
   const isPathspecError = gitErrorText.includes('pathspec') && gitErrorText.includes('did not match any files');
   if (!isPathspecError) {
    throw error;
   }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
   // During rapid stage/unstage toggling the optimistic UI can request staging a
   // path that a prior queued mutation already staged (most visibly a deletion,
   // whose file is gone from the working tree). `git add` aborts the whole batch
   // on a single unmatched pathspec, so retry per-path and skip the ones already
   // in their target state rather than failing the entire "stage all".
   for (const repoPath of repoPaths) {
    await git.raw(['add', '--', repoPath]).catch((perPathError) => {
     const perPathText = parseGitErrorText(perPathError);
     const perPathIsPathspecError =
      perPathText.includes('pathspec') && perPathText.includes('did not match any files');
     if (!perPathIsPathspecError) {
      throw perPathError;
     }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
      // During rapid stage/unstage toggling the optimistic UI can request staging a
      // path that a prior queued mutation already staged (most visibly a deletion,
      // whose file is gone from the working tree). `git add` aborts the whole batch
      // on a single unmatched pathspec, so retry per-path and skip the ones already
      // in their target state rather than failing the entire "stage all".
      for (const repoPath of repoPaths) {
        await git.raw(['add', '--', repoPath]).catch((perPathError) => {
          const perPathText = parseGitErrorText(perPathError);
          const perPathIsPathspecError =
            perPathText.includes('pathspec') && perPathText.includes('did not match any files');
          if (!perPathIsPathspecError) {
            throw perPathError;
          }
        });
      }
=======
      for (const repoPath of repoPaths) {
        await git.raw(['add', '--', repoPath]).catch((perPathError) => {
          const perPathText = parseGitErrorText(perPathError);
          const perPathIsPathspecError =
            perPathText.includes('pathspec') && perPathText.includes('did not match any files');
          if (!perPathIsPathspecError) {
            throw perPathError;
          }
        });
      }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    });
   }
  });
 });
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
async function unstageFile(directory, filePath) {
 await unstageFiles(directory, [filePath]);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
async function unstageFile(directory, filePath) {
  await unstageFiles(directory, [filePath]);
=======
async function _unstageFile(directory: string, filePath: string) {
  await unstageFiles(directory, [filePath]);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function unstageFiles(directory, paths) {
 if (!directory) {
  throw new Error('directory and path are required for unstageFile');
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function unstageFiles(directory, paths) {
  if (!directory) {
    throw new Error('directory and path are required for unstageFile');
  }
=======
export async function unstageFiles<Paths>(directory: string, paths: Paths) {
  if (!directory) {
    throw new Error('directory and path are required for unstageFile');
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const filePaths = normalizeFilePathList(paths);
 if (filePaths.length === 0) {
  throw new Error('directory and path are required for unstageFile');
 }
 validateRepositoryFilePaths(normalizeDirectoryPath(directory), filePaths);

 await withGitIndexMutationQueue(directory, async () => {
  const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory);
  const repoPaths = Array.from(new Set(await Promise.all(filePaths.map(async (filePath) => {
   const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
   return fileContext.repoPath;
  }))));
  validateRepositoryFilePaths(repoRoot, repoPaths);
  await git.raw(['restore', '--staged', '--', ...repoPaths]).catch(async () => {
   await git.raw(['reset', 'HEAD', '--', ...repoPaths]);
  });
 });
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * A Git note on `sha` recording the commit message itself. `-f` makes the write
 * idempotent for the same commit: a repeated attempt replaces the note instead
 * of failing on the one that is already there.
 */
const writeCommitNote = async (git, sha, message) => {
 await git.raw(['notes', 'add', '-f', '-m', message, sha]);
};

/**
 * Change-Id and Git note appended to a commit the caller explicitly asked for.
 * Both run inside the caller's index-mutation queue, after the commit exists,
 * and Change-Id runs first so a note lands on the amended (final) SHA. A
 * message that already carries the trailer is answered with it: the amend
 * never runs twice and no second trailer is written.
 *
 * Extra failures are reported, never swallowed: the commit exists, so the
 * caller must be able to say which extras applied. The returned object is
 * `{ changeId?, notes?, failed? }`, where `failed` lists the requested extras
 * that did not apply and why.
 */
const applyCommitExtras = async (git, directoryPath, commit, options) => {
 const applied = {};
 const failed = [];
 if (options.changeId) {
  try {
   const existing = await readCommitChangeId(directoryPath, commit);
   if (existing) {
    applied.changeId = existing;
   } else {
    const amended = await addChangeIdToHead(directoryPath, commit, { requireClean: false });
    applied.changeId = amended.changeId;
    applied.sha = amended.sha;
   }
  } catch (error) {
   failed.push({ extra: 'changeId', code: error?.code ?? 'CHANGE_ID_FAILED', message: error?.message ?? 'Change-Id was not applied' });
  }
 }
 if (options.notes) {
  try {
   await writeCommitNote(git, applied.sha ?? commit, options.notesMessage);
   applied.notes = true;
  } catch (error) {
   failed.push({ extra: 'notes', code: 'GIT_NOTES_FAILED', message: error?.message ?? 'The Git note was not written' });
  }
 }
 return { ...applied, failed };
};

export async function commit(directory, message, options = {}) {
 return withGitIndexMutationQueue(directory, async () => {
  const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory);
  // An identity applied here writes the repository's own author, and that is
  // what a commit uses. A repository on the System identity deliberately has
  // none: it says no override applies, so the machine's own author answers,
  // which is what Git itself would do. The panel names that author before
  // the commit, so it is a stated choice rather than an ambient surprise.
  const [localUserName, localUserEmail] = await Promise.all([
   git.getConfig('user.name', 'local').catch(() => null),
   git.getConfig('user.email', 'local').catch(() => null),
  ]);
  if (!localUserName?.value?.trim() || !localUserEmail?.value?.trim()) {
   const [globalUserName, globalUserEmail] = await Promise.all([
    git.getConfig('user.name', 'global').catch(() => null),
    git.getConfig('user.email', 'global').catch(() => null),
   ]);
   if (!globalUserName?.value?.trim() || !globalUserEmail?.value?.trim()) {
    throw new Error('No Git author is configured. Choose an identity for this repository, or set user.name and user.email on this computer.');
   }
  }
  let temporarilyUnstagedFiles = [];

  try {
   const requestedFiles = Array.isArray(options.files)
    ? options.files
     .map((value) => String(value || '').trim())
     .filter(Boolean)
    : [];
   const requestedStageFiles = Array.isArray(options.stageFiles)
    ? options.stageFiles
     .map((value) => String(value || '').trim())
     .filter(Boolean)
    : null;
   let filesToCommit = [];
   let commitFromIndexOnly = false;

   if (options.addAll) {
    await git.add('.');
   } else if (requestedFiles.length > 0) {
    filesToCommit = Array.from(new Set(await Promise.all(requestedFiles.map(async (filePath) => {
     const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
     return fileContext.repoPath;
    }))));

    const stageFilesToCommit = requestedStageFiles
     ? Array.from(new Set(await Promise.all(requestedStageFiles.map(async (filePath) => {
      const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
      return fileContext.repoPath;
     }))))
     : null;

    const status = await git.status();
    const fileStatusByPath = new Map(status.files.map((file) => [file.path, file]));
    filesToCommit = filesToCommit.filter((filePath) => fileStatusByPath.has(filePath));

    if (filesToCommit.length === 0) {
     throw new Error('No selected files are available to commit. Refresh git status and try again.');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function commit(directory, message, options = {}) {
  return withGitIndexMutationQueue(directory, async () => {
    const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory);
    // An identity applied here writes the repository's own author, and that is
    // what a commit uses. A repository on the System identity deliberately has
    // none: it says no override applies, so the machine's own author answers,
    // which is what Git itself would do. The panel names that author before
    // the commit, so it is a stated choice rather than an ambient surprise.
    const [localUserName, localUserEmail] = await Promise.all([
      git.getConfig('user.name', 'local').catch(() => null),
      git.getConfig('user.email', 'local').catch(() => null),
    ]);
    if (!localUserName?.value?.trim() || !localUserEmail?.value?.trim()) {
      const [globalUserName, globalUserEmail] = await Promise.all([
        git.getConfig('user.name', 'global').catch(() => null),
        git.getConfig('user.email', 'global').catch(() => null),
      ]);
      if (!globalUserName?.value?.trim() || !globalUserEmail?.value?.trim()) {
        throw new Error('No Git author is configured. Choose an identity for this repository, or set user.name and user.email on this computer.');
      }
=======
export async function commit(directory: string, message: string, options: { files?: unknown; stageFiles?: unknown; addAll?: unknown } = {}) {
  return withGitIndexMutationQueue(directory, async () => {
    const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory);
    const [localUserName, localUserEmail] = await Promise.all([
      git.getConfig('user.name', 'local').catch(() => null),
      git.getConfig('user.email', 'local').catch(() => null),
    ]);
    if (!localUserName?.value?.trim() || !localUserEmail?.value?.trim()) {
      const [globalUserName, globalUserEmail] = await Promise.all([
        git.getConfig('user.name', 'global').catch(() => null),
        git.getConfig('user.email', 'global').catch(() => null),
      ]);
      if (!globalUserName?.value?.trim() || !globalUserEmail?.value?.trim()) {
        throw new Error('No Git author is configured. Choose an identity for this repository, or set user.name and user.email on this computer.');
      }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    let temporarilyUnstagedFiles = [];
=======
    let temporarilyUnstagedFiles: string[] = [];
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
    if (requestedStageFiles) {
     commitFromIndexOnly = true;
     const selectedFileSet = new Set(filesToCommit);
     temporarilyUnstagedFiles = status.files
      .filter((file) => {
       const indexStatus = (file.index || '').trim();
       return indexStatus && indexStatus !== '?' && !selectedFileSet.has(file.path);
      })
      .map((file) => file.path);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    try {
      const requestedFiles = Array.isArray(options.files)
        ? options.files
          .map((value) => String(value || '').trim())
          .filter(Boolean)
        : [];
      const requestedStageFiles = Array.isArray(options.stageFiles)
        ? options.stageFiles
          .map((value) => String(value || '').trim())
          .filter(Boolean)
        : null;
      let filesToCommit = [];
      let commitFromIndexOnly = false;
=======
    try {
      const requestedFiles = Array.isArray(options.files)
        ? options.files
          .map((value) => String(value || '').trim())
          .filter(Boolean)
        : [];
      const requestedStageFiles = Array.isArray(options.stageFiles)
        ? options.stageFiles
          .map((value) => String(value || '').trim())
          .filter(Boolean)
        : null;
      let filesToCommit: string[] = [];
      let commitFromIndexOnly = false;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
     if (temporarilyUnstagedFiles.length > 0) {
      await git.raw(['restore', '--staged', '--', ...temporarilyUnstagedFiles]);
     }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
      if (options.addAll) {
        await git.add('.');
      } else if (requestedFiles.length > 0) {
        filesToCommit = Array.from(new Set(await Promise.all(requestedFiles.map(async (filePath) => {
          const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
          return fileContext.repoPath;
        }))));

        const stageFilesToCommit = requestedStageFiles
          ? Array.from(new Set(await Promise.all(requestedStageFiles.map(async (filePath) => {
            const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
            return fileContext.repoPath;
          }))))
          : null;

        const status = await git.status();
        const fileStatusByPath = new Map(status.files.map((file) => [file.path, file]));
      filesToCommit = filesToCommit.filter((filePath) => fileStatusByPath.has(filePath));

        if (filesToCommit.length === 0) {
          throw new Error('No selected files are available to commit. Refresh git status and try again.');
        }

        if (requestedStageFiles) {
          commitFromIndexOnly = true;
          const selectedFileSet = new Set(filesToCommit);
          temporarilyUnstagedFiles = status.files
            .filter((file) => {
              const indexStatus = (file.index || '').trim();
              return indexStatus && indexStatus !== '?' && !selectedFileSet.has(file.path);
            })
            .map((file) => file.path);

          if (temporarilyUnstagedFiles.length > 0) {
            await git.raw(['restore', '--staged', '--', ...temporarilyUnstagedFiles]);
          }
        }

        const filesNeedingAdd = requestedStageFiles
          ? (stageFilesToCommit || []).filter((filePath) => fileStatusByPath.has(filePath))
          : filesToCommit.filter((filePath) => {
            const fileStatus = fileStatusByPath.get(filePath);
            if (!fileStatus) {
              return false;
            }

            const alreadyFullyStaged = fileStatus.index !== ' ' && fileStatus.working_dir === ' ';
            return !alreadyFullyStaged;
          });

        if (filesNeedingAdd.length > 0) {
          await git.raw(['add', '--', ...filesNeedingAdd]);
        }
      }

      const commitArgs =
        !commitFromIndexOnly && !options.addAll && filesToCommit.length > 0
          ? filesToCommit
          : undefined;

      let result;
      try {
        result = await git.commit(message, commitArgs);
      } catch (error) {
        const gitErrorText = parseGitErrorText(error);
        const isPathspecError = gitErrorText.includes('pathspec') && gitErrorText.includes('did not match any files');
        if (!isPathspecError || !commitArgs || commitArgs.length === 0) {
          throw error;
        }

        // Fallback for deleted/stale selections: commit currently staged changes.
        result = await git.commit(message);
      }

      if (temporarilyUnstagedFiles.length > 0) {
        await git.raw(['add', '--', ...temporarilyUnstagedFiles]).catch((restoreError) => {
          console.error('Failed to restore temporarily unstaged files:', restoreError);
        });
      }

      return {
        success: true,
        commit: result.commit,
        branch: result.branch,
        summary: result.summary
      };
    } catch (error) {
      if (temporarilyUnstagedFiles.length > 0) {
        await git.raw(['add', '--', ...temporarilyUnstagedFiles]).catch((restoreError) => {
          console.error('Failed to restore temporarily unstaged files after commit failure:', restoreError);
        });
      }
      console.error('Failed to commit:', error);
      throw error;
=======
      if (options.addAll) {
        await git.add('.');
      } else if (requestedFiles.length > 0) {
        filesToCommit = Array.from(new Set(await Promise.all(requestedFiles.map(async (filePath) => {
          const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
          return fileContext.repoPath;
        }))));

        const stageFilesToCommit = requestedStageFiles
          ? Array.from(new Set(await Promise.all(requestedStageFiles.map(async (filePath) => {
            const fileContext = await resolveGitFileContext(directoryPath, directoryGit, filePath, repoRoot);
            return fileContext.repoPath;
          }))))
          : null;

        const status = await git.status();
        const fileStatusByPath = new Map(status.files.map((file) => [file.path, file]));
      filesToCommit = filesToCommit.filter((filePath) => fileStatusByPath.has(filePath));

        if (filesToCommit.length === 0) {
          throw new Error('No selected files are available to commit. Refresh git status and try again.');
        }

        if (requestedStageFiles) {
          commitFromIndexOnly = true;
          const selectedFileSet = new Set(filesToCommit);
          temporarilyUnstagedFiles = status.files
            .filter((file) => {
              const indexStatus = (file.index || '').trim();
              return indexStatus && indexStatus !== '?' && !selectedFileSet.has(file.path);
            })
            .map((file) => file.path);

          if (temporarilyUnstagedFiles.length > 0) {
            await git.raw(['restore', '--staged', '--', ...temporarilyUnstagedFiles]);
          }
        }

        const filesNeedingAdd = requestedStageFiles
          ? (stageFilesToCommit || []).filter((filePath) => fileStatusByPath.has(filePath))
          : filesToCommit.filter((filePath) => {
            const fileStatus = fileStatusByPath.get(filePath);
            if (!fileStatus) {
              return false;
            }

            const alreadyFullyStaged = fileStatus.index !== ' ' && fileStatus.working_dir === ' ';
            return !alreadyFullyStaged;
          });

        if (filesNeedingAdd.length > 0) {
          await git.raw(['add', '--', ...filesNeedingAdd]);
        }
      }

      const commitArgs =
        !commitFromIndexOnly && !options.addAll && filesToCommit.length > 0
          ? filesToCommit
          : undefined;

      let result;
      try {
        result = await git.commit(message, commitArgs);
      } catch (error) {
        const gitErrorText = parseGitErrorText(error);
        const isPathspecError = gitErrorText.includes('pathspec') && gitErrorText.includes('did not match any files');
        if (!isPathspecError || !commitArgs || commitArgs.length === 0) {
          throw error;
        }

        result = await git.commit(message);
      }

      if (temporarilyUnstagedFiles.length > 0) {
        await git.raw(['add', '--', ...temporarilyUnstagedFiles]).catch((restoreError) => {
          console.error('Failed to restore temporarily unstaged files:', restoreError);
        });
      }

      return {
        success: true,
        commit: result.commit,
        branch: result.branch,
        summary: result.summary
      };
    } catch (error) {
      if (temporarilyUnstagedFiles.length > 0) {
        await git.raw(['add', '--', ...temporarilyUnstagedFiles]).catch((restoreError) => {
          console.error('Failed to restore temporarily unstaged files after commit failure:', restoreError);
        });
      }
      console.error('Failed to commit:', error);
      throw error;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    }

    const filesNeedingAdd = requestedStageFiles
     ? (stageFilesToCommit || []).filter((filePath) => fileStatusByPath.has(filePath))
     : filesToCommit.filter((filePath) => {
      const fileStatus = fileStatusByPath.get(filePath);
      if (!fileStatus) {
       return false;
      }

      const alreadyFullyStaged = fileStatus.index !== ' ' && fileStatus.working_dir === ' ';
      return !alreadyFullyStaged;
     });

    if (filesNeedingAdd.length > 0) {
     await git.raw(['add', '--', ...filesNeedingAdd]);
    }
   }

   const commitArgs =
    !commitFromIndexOnly && !options.addAll && filesToCommit.length > 0
     ? filesToCommit
     : undefined;

   let result;
   try {
    result = await git.commit(message, commitArgs);
   } catch (error) {
    const gitErrorText = parseGitErrorText(error);
    const isPathspecError = gitErrorText.includes('pathspec') && gitErrorText.includes('did not match any files');
    if (!isPathspecError || !commitArgs || commitArgs.length === 0) {
     throw error;
    }

    // Fallback for deleted/stale selections: commit currently staged changes.
    result = await git.commit(message);
   }

   if (temporarilyUnstagedFiles.length > 0) {
    await git.raw(['add', '--', ...temporarilyUnstagedFiles]).catch((restoreError) => {
     console.error('Failed to restore temporarily unstaged files:', restoreError);
    });
   }

   // The direct path stays byte-for-byte the same: no extra requested means
   // no amend, no note, no second Git call.
   const extras = options.changeId === true || options.notes === true
    ? await applyCommitExtras(git, directoryPath, result.commit, {
     changeId: options.changeId === true,
     notes: options.notes === true,
     notesMessage: typeof options.notesMessage === 'string' && options.notesMessage.trim() ? options.notesMessage.trim() : String(message).trim(),
    })
    : { failed: [] };
   if (extras.failed.length > 0) {
    // The commit exists; only the requested extras did not apply. The route
    // turns this into a non-2xx body naming the commit and each failure, so
    // a partial outcome is never reported as a clean commit.
    const error = Object.assign(new Error('The commit was created but not every requested extra was applied'), {
     code: 'COMMIT_EXTRAS_FAILED',
     status: 409,
     commit: extras.sha ?? result.commit,
     branch: result.branch,
     extras: { changeId: extras.changeId ?? null, notes: extras.notes === true, failed: extras.failed },
    });
    throw error;
   }

   return {
    success: true,
    commit: extras.sha ?? result.commit,
    branch: result.branch,
    summary: result.summary,
    ...(extras.changeId ? { changeId: extras.changeId } : {}),
    ...(extras.notes ? { notes: true } : {}),
   };
  } catch (error) {
   if (temporarilyUnstagedFiles.length > 0) {
    await git.raw(['add', '--', ...temporarilyUnstagedFiles]).catch((restoreError) => {
     console.error('Failed to restore temporarily unstaged files after commit failure:', restoreError);
    });
   }
   console.error('Failed to commit:', error);
   throw error;
  }
 });
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * On a detached HEAD, `git branch` prints `(HEAD detached at v2.1.3)` and
 * simple-git lists it as a branch named after the tag or commit. Picking that
 * name in the branch selector checks out the same tag again, so the user can
 * never get back onto a branch through it. Git prints the detached line first,
 * so dropping the first occurrence of the name keeps a real branch that shares
 * it, and the details map already holds that branch's later entry.
 */
const withoutDetachedHeadEntry = (summary) => {
 if (!summary.detached) {
  return { all: summary.all, branches: summary.branches };
 }
 const index = summary.all.indexOf(summary.current);
 const all = summary.all.filter((_, entryIndex) => entryIndex !== index);
 const branches = { ...summary.branches };
 if (!all.includes(summary.current)) {
  delete branches[summary.current];
 }
 return { all, branches };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * On a detached HEAD, `git branch` prints `(HEAD detached at v2.1.3)` and
 * simple-git lists it as a branch named after the tag or commit. Picking that
 * name in the branch selector checks out the same tag again, so the user can
 * never get back onto a branch through it. Git prints the detached line first,
 * so dropping the first occurrence of the name keeps a real branch that shares
 * it, and the details map already holds that branch's later entry.
 */
const withoutDetachedHeadEntry = (summary) => {
  if (!summary.detached) {
    return { all: summary.all, branches: summary.branches };
  }
  const index = summary.all.indexOf(summary.current);
  const all = summary.all.filter((_, entryIndex) => entryIndex !== index);
  const branches = { ...summary.branches };
  if (!all.includes(summary.current)) {
    delete branches[summary.current];
  }
  return { all, branches };
=======
const withoutDetachedHeadEntry = (summary: BranchSummary) => {
  if (!summary.detached) {
    return { all: summary.all, branches: summary.branches };
  }
  const index = summary.all.indexOf(summary.current);
  const all = summary.all.filter((_, entryIndex) => entryIndex !== index);
  const branches = { ...summary.branches };
  if (!all.includes(summary.current)) {
    delete branches[summary.current];
  }
  return { all, branches };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Answers from local refs alone, as `git branch -a` does. `remote: 'live'` also
 * asks every remote: over SSH that is a connection the person's key or agent
 * may have to approve, so it runs only when the person asked for the list.
 */
export async function getBranches(directory, { remote = 'local' } = {}) {
 const { git } = await createRepositoryGitContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Answers from local refs alone, as `git branch -a` does. `remote: 'live'` also
 * asks every remote: over SSH that is a connection the person's key or agent
 * may have to approve, so it runs only when the person asked for the list.
 */
export async function getBranches(directory, { remote = 'local' } = {}) {
  const { git } = await createRepositoryGitContext(directory);
=======
export async function getBranches(directory: string, { remote = 'local' } = {}) {
  const { git } = await createRepositoryGitContext(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 try {
  const result = await git.branch();
  const { all: allBranches, branches } = withoutDetachedHeadEntry(result);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  try {
    const result = await git.branch();
    const { all: allBranches, branches } = withoutDetachedHeadEntry(result);
    const remoteBranches = allBranches.filter(branch => branch.startsWith('remotes/'));
    // A live listing is read-only ref discovery, not a transfer: it never writes
    // refs and never takes the planned-operation path, so a branch pushed from
    // elsewhere is listed and a ref deleted on the remote is pruned without a
    // fetch first.
    const activeRemoteBranches = remote === 'local'
      ? remoteBranches
      : await filterActiveRemoteBranches(git, directory, remoteBranches);
    const defaultBranches = await getRemoteDefaultBranches(git);
=======
  try {
    const result = await git.branch();
    const { all: allBranches, branches } = withoutDetachedHeadEntry(result);
    const remoteBranches = allBranches.filter(branch => branch.startsWith('remotes/'));
    const activeRemoteBranches = remote === 'local'
      ? remoteBranches
      : await filterActiveRemoteBranches(git, directory, remoteBranches);
    const defaultBranches = await getRemoteDefaultBranches(git);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

  const remoteBranches = allBranches.filter(branch => branch.startsWith('remotes/'));
  // A live listing is read-only ref discovery, not a transfer: it never writes
  // refs and never takes the planned-operation path, so a branch pushed from
  // elsewhere is listed and a ref deleted on the remote is pruned without a
  // fetch first.
  const activeRemoteBranches = remote === 'local'
   ? remoteBranches
   : await filterActiveRemoteBranches(git, directory, remoteBranches);
  const defaultBranches = await getRemoteDefaultBranches(git);

  return {
   all: [
    ...allBranches.filter(branch => !branch.startsWith('remotes/')),
    ...activeRemoteBranches,
   ],
   current: result.current,
   branches,
   defaultBranches,
  };
 } catch (error) {
  console.error('Failed to get branches:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Counts locally unpushed commits for a small caller-supplied set of local
 * branches. This deliberately reads only local refs: the branch picker calls
 * it when opened, never polls, and never fetches a remote behind the user's
 * back. Unknown, remote, and upstream-less branches are omitted.
 */
export async function getUnpushedBranchCounts(directory, branchNames) {
 const { git } = await createRepositoryGitContext(directory);
 const requested = [...new Set(Array.isArray(branchNames) ? branchNames : [])]
  .filter((name) => typeof name === 'string' && name.length > 0)
  .slice(0, 5);
 if (requested.length === 0) return { counts: {} };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Counts locally unpushed commits for a small caller-supplied set of local
 * branches. This deliberately reads only local refs: the branch picker calls
 * it when opened, never polls, and never fetches a remote behind the user's
 * back. Unknown, remote, and upstream-less branches are omitted.
 */
export async function getUnpushedBranchCounts(directory, branchNames) {
  const { git } = await createRepositoryGitContext(directory);
  const requested = [...new Set(Array.isArray(branchNames) ? branchNames : [])]
    .filter((name) => typeof name === 'string' && name.length > 0)
    .slice(0, 5);
  if (requested.length === 0) return { counts: {} };
=======
export async function getUnpushedBranchCounts(directory: string, branchNames: string[]) {
  const { git } = await createRepositoryGitContext(directory);
  const requested = [...new Set(Array.isArray(branchNames) ? branchNames : [])]
    .filter((name) => isPrimitiveString(name) && name.length > 0)
    .slice(0, 5);
  if (requested.length === 0) return { counts: {} };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const local = new Set((await git.branchLocal()).all);
 const counts = {};
 await Promise.all(requested.map(async (branch) => {
  if (!local.has(branch)) return;
  const upstream = await git.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{upstream}`])
   .then((value) => value.trim())
   .catch(() => '');
  if (!upstream) return;
  const count = await git.raw(['rev-list', '--count', `${upstream}..${branch}`])
   .then((value) => Number.parseInt(value.trim(), 10))
   .catch(() => 0);
  if (Number.isFinite(count) && count > 0) counts[branch] = count;
 }));
 return { counts };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const local = new Set((await git.branchLocal()).all);
  const counts = {};
  await Promise.all(requested.map(async (branch) => {
    if (!local.has(branch)) return;
    const upstream = await git.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{upstream}`])
      .then((value) => value.trim())
      .catch(() => '');
    if (!upstream) return;
    const count = await git.raw(['rev-list', '--count', `${upstream}..${branch}`])
      .then((value) => Number.parseInt(value.trim(), 10))
      .catch(() => 0);
    if (Number.isFinite(count) && count > 0) counts[branch] = count;
  }));
  return { counts };
=======
  const local = new Set((await git.branchLocal()).all);
  const counts: Record<string, number> = {};
  await Promise.all(requested.map(async (branch) => {
    if (!local.has(branch)) return;
    const upstream = await git.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{upstream}`])
      .then((value) => value.trim())
      .catch(() => '');
    if (!upstream) return;
    const count = await git.raw(['rev-list', '--count', `${upstream}..${branch}`])
      .then((value) => Number.parseInt(value.trim(), 10))
      .catch(() => 0);
    if (Number.isFinite(count) && count > 0) counts[branch] = count;
  }));
  return { counts };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
async function getRemoteDefaultBranches(git) {
 let defaults = {};
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
async function getRemoteDefaultBranches(git) {
  let defaults = {};
=======
async function getRemoteDefaultBranches(git: SimpleGit) {
  let defaults: Record<string, string> = {};
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 try {
  const refs = await git.raw([
   'for-each-ref',
   '--format=%(refname) %(symref)',
   'refs/remotes',
  ]);
  defaults = Object.fromEntries(
   refs.trim().split('\n').flatMap((line) => {
    const [ref, symbolicRef] = line.split(' ');
    const match = ref.match(/^refs\/remotes\/([^/]+)\/HEAD$/);
    const prefix = match ? `refs/remotes/${match[1]}/` : '';
    return match && typeof symbolicRef === 'string' && symbolicRef.startsWith(prefix)
     ? [[match[1], symbolicRef.slice(prefix.length)]]
     : [];
   })
  );
 } catch {
  defaults = {};
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  try {
    const refs = await git.raw([
      'for-each-ref',
      '--format=%(refname) %(symref)',
      'refs/remotes',
    ]);
    defaults = Object.fromEntries(
      refs.trim().split('\n').flatMap((line) => {
        const [ref, symbolicRef] = line.split(' ');
        const match = ref.match(/^refs\/remotes\/([^/]+)\/HEAD$/);
        const prefix = match ? `refs/remotes/${match[1]}/` : '';
        return match && typeof symbolicRef === 'string' && symbolicRef.startsWith(prefix)
          ? [[match[1], symbolicRef.slice(prefix.length)]]
          : [];
      })
    );
  } catch {
    defaults = {};
  }
=======
  try {
    const refs = await git.raw([
      'for-each-ref',
      '--format=%(refname) %(symref)',
      'refs/remotes',
    ]);
    defaults = Object.fromEntries(
      refs.trim().split('\n').flatMap((line): [string, string][] => {
        const [ref = '', symbolicRef] = line.split(' ');
        const match = ref.match(/^refs\/remotes\/([^/]+)\/HEAD$/);
        const prefix = match ? `refs/remotes/${match[1]}/` : '';
        return match && symbolicRef !== undefined && symbolicRef.startsWith(prefix)
          ? [[match[1] ?? '', symbolicRef.slice(prefix.length)]]
          : [];
      })
    );
  } catch {
    defaults = {};
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 return defaults;
}

const REMOTE_HEADS_TTL_MS = 30_000;
const remoteHeadsCache = new Map<string, { at: number; localKey: string; heads: Promise<Set<string>> }>();

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const readRemoteHeads = (git, directory, remote, localRefs) => {
 const key = `${directory}\0${remote.name}\0${remote.refs?.fetch ?? ''}`;
 const localKey = localRefs.join('\n');
 const cached = remoteHeadsCache.get(key);
 if (cached && cached.localKey === localKey && Date.now() - cached.at < REMOTE_HEADS_TTL_MS) return cached.heads;
 const heads = git.raw(['ls-remote', '--heads', '--', remote.name]).then((output) => {
  const names = new Set();
  for (const line of output.trim().split('\n')) {
   if (line.includes('\trefs/heads/')) names.add(line.split('\t')[1].replace('refs/heads/', ''));
  }
  return names;
 });
 const entry = { at: Date.now(), localKey, heads };
 remoteHeadsCache.set(key, entry);
 // A remote that did not answer is asked again next time.
 heads.catch(() => { if (remoteHeadsCache.get(key) === entry) remoteHeadsCache.delete(key); });
 return heads;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const readRemoteHeads = (git, directory, remote, localRefs) => {
  const key = `${directory}\0${remote.name}\0${remote.refs?.fetch ?? ''}`;
  const localKey = localRefs.join('\n');
  const cached = remoteHeadsCache.get(key);
  if (cached && cached.localKey === localKey && Date.now() - cached.at < REMOTE_HEADS_TTL_MS) return cached.heads;
  const heads = git.raw(['ls-remote', '--heads', '--', remote.name]).then((output) => {
    const names = new Set();
    for (const line of output.trim().split('\n')) {
      if (line.includes('\trefs/heads/')) names.add(line.split('\t')[1].replace('refs/heads/', ''));
    }
    return names;
  });
  const entry = { at: Date.now(), localKey, heads };
  remoteHeadsCache.set(key, entry);
  // A remote that did not answer is asked again next time.
  heads.catch(() => { if (remoteHeadsCache.get(key) === entry) remoteHeadsCache.delete(key); });
  return heads;
=======
const readRemoteHeads = (git: SimpleGit, directory: string, remote: RemoteWithRefs, localRefs: string[]) => {
  const key = `${directory}\0${remote.name}\0${remote.refs?.fetch ?? ''}`;
  const localKey = localRefs.join('\n');
  const cached = remoteHeadsCache.get(key);
  if (cached && cached.localKey === localKey && Date.now() - cached.at < REMOTE_HEADS_TTL_MS) return cached.heads;
  const heads = git.raw(['ls-remote', '--heads', '--', remote.name]).then((output) => {
    const names = new Set<string>();
    for (const line of output.trim().split('\n')) {
      if (line.includes('\trefs/heads/')) names.add((line.split('\t')[1] ?? '').replace('refs/heads/', ''));
    }
    return names;
  });
  const entry = { at: Date.now(), localKey, heads };
  remoteHeadsCache.set(key, entry);
  heads.catch(() => { if (remoteHeadsCache.get(key) === entry) remoteHeadsCache.delete(key); });
  return heads;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
async function filterActiveRemoteBranches(git, directory, remoteBranches) {
 try {
  const remotes = await git.getRemotes(true);
  const branchesByRemote = new Map();
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
async function filterActiveRemoteBranches(git, directory, remoteBranches) {
  try {
    const remotes = await git.getRemotes(true);
    const branchesByRemote = new Map();
=======
async function filterActiveRemoteBranches(git: SimpleGit, directory: string, remoteBranches: string[]) {
  try {
    const remotes = await git.getRemotes(true);
    const branchesByRemote = new Map<string, Set<string>>();
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  // A remote that did not answer says nothing about its branches. Dropping
  // them would turn "we could not ask" into "these branches are gone", and
  // callers use this list to decide whether a base branch exists at all — so
  // offline would silently remove comparisons that work perfectly well
  // against the local remote-tracking refs.
  const unreachableRemotes = new Set();
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    // A remote that did not answer says nothing about its branches. Dropping
    // them would turn "we could not ask" into "these branches are gone", and
    // callers use this list to decide whether a base branch exists at all — so
    // offline would silently remove comparisons that work perfectly well
    // against the local remote-tracking refs.
    const unreachableRemotes = new Set();
=======
    const unreachableRemotes = new Set<string>();
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

  await Promise.all(remotes.map(async (remote) => {
   try {
    const localRefs = remoteBranches.filter((branch) => branch.startsWith(`remotes/${remote.name}/`));
    branchesByRemote.set(remote.name, await readRemoteHeads(git, directory, remote, localRefs));
   } catch {
    unreachableRemotes.add(remote.name);
   }
  }));

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  const activeBranches = remoteBranches.filter(remoteBranch => {
   const match = remoteBranch.match(/^remotes\/[^\/]+\/(.+)$/);
   if (!match) return false;
   const remoteName = remoteBranch.split('/')[1];
   const branchName = match[1];
   if (unreachableRemotes.has(remoteName)) return true;
   return branchesByRemote.get(remoteName)?.has(branchName) ?? false;
  });
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    const activeBranches = remoteBranches.filter(remoteBranch => {
      const match = remoteBranch.match(/^remotes\/[^\/]+\/(.+)$/);
      if (!match) return false;
      const remoteName = remoteBranch.split('/')[1];
      const branchName = match[1];
      if (unreachableRemotes.has(remoteName)) return true;
      return branchesByRemote.get(remoteName)?.has(branchName) ?? false;
    });
=======
    const activeBranches = remoteBranches.filter(remoteBranch => {
      const match = remoteBranch.match(/^remotes\/[^/]+\/(.+)$/);
      if (!match) return false;
      const remoteName = remoteBranch.split('/')[1] ?? '';
      const branchName = match[1] ?? '';
      if (unreachableRemotes.has(remoteName)) return true;
      return branchesByRemote.get(remoteName)?.has(branchName) ?? false;
    });
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  // A branch pushed to the remote that was never fetched locally has no
  // remote-tracking ref, so `git branch` never reports it — but ls-remote
  // just told us it exists. Add those so a freshly pushed branch shows up
  // without requiring a fetch first (#2098). Unreachable remotes have no
  // ls-remote data and therefore add nothing here; their local view above
  // is preserved unchanged.
  const seenBranches = new Set(activeBranches);
  for (const [remoteName, actualRemoteBranches] of branchesByRemote) {
   for (const branchName of actualRemoteBranches) {
    const qualifiedBranch = `remotes/${remoteName}/${branchName}`;
    if (!seenBranches.has(qualifiedBranch)) {
     seenBranches.add(qualifiedBranch);
     activeBranches.push(qualifiedBranch);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    // A branch pushed to the remote that was never fetched locally has no
    // remote-tracking ref, so `git branch` never reports it — but ls-remote
    // just told us it exists. Add those so a freshly pushed branch shows up
    // without requiring a fetch first (#2098). Unreachable remotes have no
    // ls-remote data and therefore add nothing here; their local view above
    // is preserved unchanged.
    const seenBranches = new Set(activeBranches);
    for (const [remoteName, actualRemoteBranches] of branchesByRemote) {
      for (const branchName of actualRemoteBranches) {
        const qualifiedBranch = `remotes/${remoteName}/${branchName}`;
        if (!seenBranches.has(qualifiedBranch)) {
          seenBranches.add(qualifiedBranch);
          activeBranches.push(qualifiedBranch);
        }
      }
=======
    const seenBranches = new Set(activeBranches);
    for (const [remoteName, actualRemoteBranches] of branchesByRemote) {
      for (const branchName of actualRemoteBranches) {
        const qualifiedBranch = `remotes/${remoteName}/${branchName}`;
        if (!seenBranches.has(qualifiedBranch)) {
          seenBranches.add(qualifiedBranch);
          activeBranches.push(qualifiedBranch);
        }
      }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
   }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js

    return activeBranches;
  } catch (error) {
    console.warn('Failed to filter active remote branches, returning all:', error.message);
    return remoteBranches;
=======

    return activeBranches;
  } catch (error) {
    console.warn('Failed to filter active remote branches, returning all:', errorField(error, 'message'));
    return remoteBranches;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

  return activeBranches;
 } catch (error) {
  console.warn('Failed to filter active remote branches, returning all:', error.message);
  return remoteBranches;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function createBranch(directory, branchName, options = {}) {
 const { git } = await createRepositoryGitContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function createBranch(directory, branchName, options = {}) {
  const { git } = await createRepositoryGitContext(directory);
=======
export async function createBranch(directory: string, branchName: string, options: { startPoint?: string } = {}) {
  const { git } = await createRepositoryGitContext(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 try {
  await git.checkoutBranch(branchName, options.startPoint || 'HEAD');
  return { success: true, branch: branchName };
 } catch (error) {
  console.error('Failed to create branch:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Deliberately not `--quiet`: simple-git resolves a quiet non-zero exit as
// success, so the ref itself has to be echoed for the answer to mean anything.
const gitRefExists = async (git, ref) => {
 try {
  const output = await git.raw(['show-ref', '--verify', ref]);
  return String(output).trim().length > 0;
 } catch {
  return false;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Deliberately not `--quiet`: simple-git resolves a quiet non-zero exit as
// success, so the ref itself has to be echoed for the answer to mean anything.
const gitRefExists = async (git, ref) => {
  try {
    const output = await git.raw(['show-ref', '--verify', ref]);
    return String(output).trim().length > 0;
  } catch {
    return false;
  }
=======
const gitRefExists = async (git: SimpleGit, ref: string) => {
  try {
    const output = await git.raw(['show-ref', '--verify', ref]);
    return String(output).trim().length > 0;
  } catch {
    return false;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * The branch selector lists remote-tracking branches beside local ones, so
 * picking `origin/main` means "work on main", not "detach HEAD at the remote's
 * commit" — which is what a literal checkout of a remote-tracking ref does.
 * Resolve such a pick to the local branch, creating it with tracking when it
 * does not exist yet. Anything we cannot resolve is checked out as requested,
 * leaving git's own DWIM behavior intact.
 */
const resolveBranchCheckoutTarget = async (git, branchName) => {
 const requested = String(branchName || '').trim();
 if (!requested) {
  throw new Error('Branch name is required');
 }

 const asRequested = { branch: requested, remoteRef: null };

 if (await gitRefExists(git, `refs/heads/${requested}`)) {
  return asRequested;
 }

 const remoteRef = requested.replace(/^remotes\//, '');
 const remotes = await git.getRemotes();
 const remote = remotes.find((entry) => entry?.name && remoteRef.startsWith(`${entry.name}/`));
 if (!remote) {
  return asRequested;
 }

 const localBranch = remoteRef.slice(remote.name.length + 1);
 // `origin/HEAD` names no branch of its own; it is a pointer to one.
 if (!localBranch || localBranch === 'HEAD') {
  return asRequested;
 }

 // The branch list also carries branches that only `ls-remote` knows about
 // (#2098): they exist on the remote but were never fetched, so there is no
 // remote-tracking ref and a literal checkout fails with a pathspec error.
 // Fetch the single branch first so the tracking ref exists, then fall through
 // to the normal create-with-tracking path.
 if (!(await gitRefExists(git, `refs/remotes/${remoteRef}`))) {
  try {
   await git.fetch(remote.name, localBranch);
  } catch (error) {
   throw new Error(`Failed to fetch ${localBranch} from ${remote.name}: ${error?.message || error}`);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * The branch selector lists remote-tracking branches beside local ones, so
 * picking `origin/main` means "work on main", not "detach HEAD at the remote's
 * commit" — which is what a literal checkout of a remote-tracking ref does.
 * Resolve such a pick to the local branch, creating it with tracking when it
 * does not exist yet. Anything we cannot resolve is checked out as requested,
 * leaving git's own DWIM behavior intact.
 */
const resolveBranchCheckoutTarget = async (git, branchName) => {
  const requested = String(branchName || '').trim();
  if (!requested) {
    throw new Error('Branch name is required');
=======
const resolveBranchCheckoutTarget = async (git: SimpleGit, branchName: string) => {
  const requested = String(branchName || '').trim();
  if (!requested) {
    throw new Error('Branch name is required');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
||||||| bc50ba56aa:packages/web/server/lib/git/service.js

  const asRequested = { branch: requested, remoteRef: null };

  if (await gitRefExists(git, `refs/heads/${requested}`)) {
    return asRequested;
  }

  const remoteRef = requested.replace(/^remotes\//, '');
  const remotes = await git.getRemotes();
  const remote = remotes.find((entry) => entry?.name && remoteRef.startsWith(`${entry.name}/`));
  if (!remote) {
    return asRequested;
  }

  const localBranch = remoteRef.slice(remote.name.length + 1);
  // `origin/HEAD` names no branch of its own; it is a pointer to one.
  if (!localBranch || localBranch === 'HEAD') {
    return asRequested;
  }

  // The branch list also carries branches that only `ls-remote` knows about
  // (#2098): they exist on the remote but were never fetched, so there is no
  // remote-tracking ref and a literal checkout fails with a pathspec error.
  // Fetch the single branch first so the tracking ref exists, then fall through
  // to the normal create-with-tracking path.
=======

  const asRequested = { branch: requested, remoteRef: null };

  if (await gitRefExists(git, `refs/heads/${requested}`)) {
    return asRequested;
  }

  const remoteRef = requested.replace(/^remotes\//, '');
  const remotes = await git.getRemotes();
  const remote = remotes.find((entry) => entry?.name && remoteRef.startsWith(`${entry.name}/`));
  if (!remote) {
    return asRequested;
  }

  const localBranch = remoteRef.slice(remote.name.length + 1);
  if (!localBranch || localBranch === 'HEAD') {
    return asRequested;
  }

>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  if (!(await gitRefExists(git, `refs/remotes/${remoteRef}`))) {
<<<<<<< HEAD:packages/web/server/lib/git/service.js
   throw new Error(`Branch ${localBranch} no longer exists on remote ${remote.name}`);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    try {
      await git.fetch(remote.name, localBranch);
    } catch (error) {
      throw new Error(`Failed to fetch ${localBranch} from ${remote.name}: ${error?.message || error}`);
    }
    if (!(await gitRefExists(git, `refs/remotes/${remoteRef}`))) {
      throw new Error(`Branch ${localBranch} no longer exists on remote ${remote.name}`);
    }
=======
    try {
      await git.fetch(remote.name, localBranch);
    } catch (error) {
      throw new Error(`Failed to fetch ${localBranch} from ${remote.name}: ${errorField(error, 'message') || error}`);
    }
    if (!(await gitRefExists(git, `refs/remotes/${remoteRef}`))) {
      throw new Error(`Branch ${localBranch} no longer exists on remote ${remote.name}`);
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 }

 const localExists = await gitRefExists(git, `refs/heads/${localBranch}`);
 return { branch: localBranch, remoteRef: localExists ? null : remoteRef };
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function checkoutBranch(directory, branchName) {
 const { git } = await createRepositoryGitContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function checkoutBranch(directory, branchName) {
  const { git } = await createRepositoryGitContext(directory);
=======
export async function checkoutBranch(directory: string, branchName: string) {
  const { git } = await createRepositoryGitContext(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 try {
  const target = await resolveBranchCheckoutTarget(git, branchName);
  if (target.remoteRef) {
   await git.raw(['checkout', '-b', target.branch, '--track', target.remoteRef]);
  } else {
   await git.checkout(target.branch);
  }
  return { success: true, branch: target.branch };
 } catch (error) {
  console.error('Failed to checkout branch:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function checkoutCommit(directory, hash) {
 if (!isValidCommitHash(hash)) {
  throw new Error('Invalid commit hash');
 }
 const { git } = await createRepositoryGitContext(directory);
 try {
  await git.checkout(hash);
  return { success: true };
 } catch (error) {
  console.error('Failed to checkout commit:', error);
  throw error;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function checkoutCommit(directory, hash) {
  if (!isValidCommitHash(hash)) {
    throw new Error('Invalid commit hash');
  }
  const { git } = await createRepositoryGitContext(directory);
  try {
    await git.checkout(hash);
    return { success: true };
  } catch (error) {
    console.error('Failed to checkout commit:', error);
    throw error;
  }
=======
export async function checkoutCommit(directory: string, hash: string) {
  if (!isValidCommitHash(hash)) {
    throw new Error('Invalid commit hash');
  }
  const { git } = await createRepositoryGitContext(directory);
  try {
    await git.checkout(hash);
    return { success: true };
  } catch (error) {
    console.error('Failed to checkout commit:', error);
    throw error;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function cherryPick(directory, hash) {
 if (!isValidCommitHash(hash)) {
  throw new Error('Invalid commit hash');
 }
 const { git } = await createRepositoryGitContext(directory);
 try {
  await git.raw(['cherry-pick', hash]);
  return { success: true, conflict: false };
 } catch (error) {
  const errorMessage = String(error?.message || error || '').toLowerCase();
  const isConflict =
   errorMessage.includes('conflict') ||
   errorMessage.includes('patch does not apply');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function cherryPick(directory, hash) {
  if (!isValidCommitHash(hash)) {
    throw new Error('Invalid commit hash');
  }
  const { git } = await createRepositoryGitContext(directory);
  try {
    await git.raw(['cherry-pick', hash]);
    return { success: true, conflict: false };
  } catch (error) {
    const errorMessage = String(error?.message || error || '').toLowerCase();
    const isConflict =
      errorMessage.includes('conflict') ||
      errorMessage.includes('patch does not apply');
=======
export async function cherryPick(directory: string, hash: string) {
  if (!isValidCommitHash(hash)) {
    throw new Error('Invalid commit hash');
  }
  const { git } = await createRepositoryGitContext(directory);
  try {
    await git.raw(['cherry-pick', hash]);
    return { success: true, conflict: false };
  } catch (error) {
    const errorMessage = String(errorField(error, 'message') || error || '').toLowerCase();
    const isConflict =
      errorMessage.includes('conflict') ||
      errorMessage.includes('patch does not apply');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

  if (isConflict) {
   const status = await git.status().catch(() => ({ conflicted: [] }));
   return {
    success: false,
    conflict: true,
    conflictFiles: status.conflicted || [],
   };
  }

  console.error('Failed to cherry-pick:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function revertCommit(directory, hash) {
 if (!isValidCommitHash(hash)) {
  throw new Error('Invalid commit hash');
 }
 const { git } = await createRepositoryGitContext(directory);
 try {
  await git.raw(['revert', '--no-commit', hash]);
  return { success: true, conflict: false };
 } catch (error) {
  const errorMessage = String(error?.message || error || '').toLowerCase();
  const isConflict =
   errorMessage.includes('conflict') ||
   errorMessage.includes('revert failed');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function revertCommit(directory, hash) {
  if (!isValidCommitHash(hash)) {
    throw new Error('Invalid commit hash');
  }
  const { git } = await createRepositoryGitContext(directory);
  try {
    await git.raw(['revert', '--no-commit', hash]);
    return { success: true, conflict: false };
  } catch (error) {
    const errorMessage = String(error?.message || error || '').toLowerCase();
    const isConflict =
      errorMessage.includes('conflict') ||
      errorMessage.includes('revert failed');
=======
export async function revertCommit(directory: string, hash: string) {
  if (!isValidCommitHash(hash)) {
    throw new Error('Invalid commit hash');
  }
  const { git } = await createRepositoryGitContext(directory);
  try {
    await git.raw(['revert', '--no-commit', hash]);
    return { success: true, conflict: false };
  } catch (error) {
    const errorMessage = String(errorField(error, 'message') || error || '').toLowerCase();
    const isConflict =
      errorMessage.includes('conflict') ||
      errorMessage.includes('revert failed');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

  if (isConflict) {
   const status = await git.status().catch(() => ({ conflicted: [] }));
   return {
    success: false,
    conflict: true,
    conflictFiles: status.conflicted || [],
   };
  }

  console.error('Failed to revert commit:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function resetToCommit(directory, hash, mode, force = false) {
 if (!isValidCommitHash(hash)) {
  throw new Error('Invalid commit hash');
 }
 const { git } = await createRepositoryGitContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function resetToCommit(directory, hash, mode, force = false) {
  if (!isValidCommitHash(hash)) {
    throw new Error('Invalid commit hash');
  }
  const { git } = await createRepositoryGitContext(directory);
=======
export async function resetToCommit(directory: string, hash: string, mode: string, force = false) {
  if (!isValidCommitHash(hash)) {
    throw new Error('Invalid commit hash');
  }
  const { git } = await createRepositoryGitContext(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 if (mode === 'hard' && !force) {
  const status = await git.status();
  const isDirty = !status.isClean();
  if (isDirty) {
   throw new Error('Cannot hard reset: uncommitted changes in working tree. Stash or commit first, or use force.');
  }
 }

 try {
  await git.raw(['reset', `--${mode}`, hash]);
  return { success: true };
 } catch (error) {
  console.error('Failed to reset to commit:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// `git worktree list` answers from any directory of a repository, but the
// repository root resolution behind it (`--show-toplevel`) has no answer in a
// bare repository: "this operation must be run in a work tree". A bare
// checkout used as the project directory would otherwise read as a failure
// and show no worktrees at all, so fall back to listing from the directory
// itself when it is still a git directory.
const resolveWorktreeListingDirectory = async (directoryPath) => {
 try {
  const directoryGit = await createGit(directoryPath);
  return await resolveGitRepositoryRoot(directoryPath, directoryGit);
 } catch (error) {
  const probe = await runGitCommand(directoryPath, ['rev-parse', '--git-dir']);
  if (probe.success) {
   return directoryPath;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// `git worktree list` answers from any directory of a repository, but the
// repository root resolution behind it (`--show-toplevel`) has no answer in a
// bare repository: "this operation must be run in a work tree". A bare
// checkout used as the project directory would otherwise read as a failure
// and show no worktrees at all, so fall back to listing from the directory
// itself when it is still a git directory.
const resolveWorktreeListingDirectory = async (directoryPath) => {
  try {
    const directoryGit = await createGit(directoryPath);
    return await resolveGitRepositoryRoot(directoryPath, directoryGit);
  } catch (error) {
    const probe = await runGitCommand(directoryPath, ['rev-parse', '--git-dir']);
    if (probe.success) {
      return directoryPath;
    }
    throw error;
=======
const resolveWorktreeListingDirectory = async (directoryPath: string) => {
  try {
    const directoryGit = await createGit(directoryPath);
    return await resolveGitRepositoryRoot(directoryPath, directoryGit);
  } catch (error) {
    const probe = await runGitCommand(directoryPath, ['rev-parse', '--git-dir']);
    if (probe.success) {
      return directoryPath;
    }
    throw error;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  throw error;
 }
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function getWorktrees(directory) {
 const directoryPath = normalizeDirectoryPath(directory);
 if (!directoryPath || !fs.existsSync(directoryPath)) {
  return [];
 }
 try {
  const listingDirectory = await resolveWorktreeListingDirectory(directoryPath);
  const result = await runGitCommandOrThrow(
   listingDirectory,
   ['worktree', 'list', '--porcelain'],
   'Failed to list git worktrees'
  );
  const [titles, pins] = await Promise.all([readBranchTitles(listingDirectory), readBranchPins(listingDirectory)]);
  return parseWorktreePorcelain(result.stdout)
   .filter((entry) => entry.bare !== true)
   .map((entry) => {
    const title = entry.branch ? titles.get(entry.branch) : undefined;
    const pin = entry.branch ? pins.get(entry.branch) : undefined;
    return {
     head: entry.head || '',
     name: path.basename(entry.worktree || ''),
     branch: entry.branch || '',
     path: entry.worktree,
     prunable: entry.prunable === true,
     // Absent until the task is named; JSON leaves an undefined key out.
     title: title || undefined,
     pinnedAt: pin?.pinnedAt,
     pinList: pin?.list,
    };
   });
 } catch (error) {
  // Worktrees are an optional feature. When the caller passes a directory
  // that is not inside any git repository (for example, the managed
  // OpenCode's working directory or an unconfigured project path), git
  // exits with "fatal: not a git repository ...". Treat that as an
  // authoritative empty result so the route handler can still respond
  // 200 [] and the desktop main.log stays free of noise. Any other failure
  // is a failure: callers keep their last known topology instead of
  // treating "git could not answer" as "there are no worktrees".
  if (isNotGitRepositoryError(error)) return [];
  throw error;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function getWorktrees(directory) {
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    return [];
  }
  try {
    const listingDirectory = await resolveWorktreeListingDirectory(directoryPath);
    const result = await runGitCommandOrThrow(
      listingDirectory,
      ['worktree', 'list', '--porcelain'],
      'Failed to list git worktrees'
    );
    const [titles, pins] = await Promise.all([readBranchTitles(listingDirectory), readBranchPins(listingDirectory)]);
    return parseWorktreePorcelain(result.stdout)
      .filter((entry) => entry.bare !== true)
      .map((entry) => {
        const title = entry.branch ? titles.get(entry.branch) : undefined;
        const pin = entry.branch ? pins.get(entry.branch) : undefined;
        return {
          head: entry.head || '',
          name: path.basename(entry.worktree || ''),
          branch: entry.branch || '',
          path: entry.worktree,
          prunable: entry.prunable === true,
          // Absent until the task is named; JSON leaves an undefined key out.
          title: title || undefined,
          pinnedAt: pin?.pinnedAt,
          pinList: pin?.list,
        };
      });
  } catch (error) {
    // Worktrees are an optional feature. When the caller passes a directory
    // that is not inside any git repository (for example, the managed
    // OpenCode's working directory or an unconfigured project path), git
    // exits with "fatal: not a git repository ...". Treat that as an
    // authoritative empty result so the route handler can still respond
    // 200 [] and the desktop main.log stays free of noise. Any other failure
    // is a failure: callers keep their last known topology instead of
    // treating "git could not answer" as "there are no worktrees".
    if (isNotGitRepositoryError(error)) return [];
    throw error;
  }
=======
export async function getWorktrees(directory: string) {
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    return [];
  }
  try {
    const listingDirectory = await resolveWorktreeListingDirectory(directoryPath);
    const result = await runGitCommandOrThrow(
      listingDirectory,
      ['worktree', 'list', '--porcelain'],
      'Failed to list git worktrees'
    );
    const [titles, pins] = await Promise.all([readBranchTitles(listingDirectory), readBranchPins(listingDirectory)]);
    return parseWorktreePorcelain(result.stdout)
      .filter((entry) => entry.bare !== true)
      .map((entry) => {
        const title = entry.branch ? titles.get(entry.branch) : undefined;
        const pin = entry.branch ? pins.get(entry.branch) : undefined;
        return {
          head: entry.head || '',
          name: path.basename(entry.worktree || ''),
          branch: entry.branch || '',
          path: entry.worktree,
          prunable: entry.prunable === true,
          title: title || undefined,
          pinnedAt: pin?.pinnedAt,
          pinList: pin?.list,
        };
      });
  } catch (error) {
    if (isNotGitRepositoryError(error)) return [];
    throw error;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}


const TASK_TITLE_MAX_LENGTH = 120;
const BRANCH_TITLE_KEY_PATTERN = '^branch\\..*\\.description$';

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** The first line of a description, trimmed and capped: what a sidebar row shows. */
const toTaskTitle = (description) => {
 const firstLine = String(description || '').split(/\r?\n/).find((line) => line.trim()) || '';
 return firstLine.trim().slice(0, TASK_TITLE_MAX_LENGTH);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** The first line of a description, trimmed and capped: what a sidebar row shows. */
const toTaskTitle = (description) => {
  const firstLine = String(description || '').split(/\r?\n/).find((line) => line.trim()) || '';
  return firstLine.trim().slice(0, TASK_TITLE_MAX_LENGTH);
=======
const toTaskTitle = (description: string | undefined) => {
  const firstLine = String(description || '').split(/\r?\n/).find((line) => line.trim()) || '';
  return firstLine.trim().slice(0, TASK_TITLE_MAX_LENGTH);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Every branch's title in one read. `-z` separates entries with NUL and the key
 * from its value with a newline, so a description spanning lines parses whole.
 * No description anywhere exits with status 1, which is an empty answer; any
 * other failure leaves the listing without titles rather than failing it.
 */
const readBranchTitles = async (repositoryDirectory) => {
 const titles = new Map();
 const result = await runGitCommand(repositoryDirectory, ['config', '-z', '--get-regexp', BRANCH_TITLE_KEY_PATTERN]);
 if (!result.success) return titles;
 for (const record of String(result.stdout || '').split('\0')) {
  const newline = record.indexOf('\n');
  if (newline <= 0) continue;
  // The key matched BRANCH_TITLE_KEY_PATTERN: `branch.<name>.description`.
  const branch = record.slice('branch.'.length, newline - '.description'.length);
  const title = toTaskTitle(record.slice(newline + 1));
  if (branch && title) titles.set(branch, title);
 }
 return titles;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Every branch's title in one read. `-z` separates entries with NUL and the key
 * from its value with a newline, so a description spanning lines parses whole.
 * No description anywhere exits with status 1, which is an empty answer; any
 * other failure leaves the listing without titles rather than failing it.
 */
const readBranchTitles = async (repositoryDirectory) => {
  const titles = new Map();
  const result = await runGitCommand(repositoryDirectory, ['config', '-z', '--get-regexp', BRANCH_TITLE_KEY_PATTERN]);
  if (!result.success) return titles;
  for (const record of String(result.stdout || '').split('\0')) {
    const newline = record.indexOf('\n');
    if (newline <= 0) continue;
    // The key matched BRANCH_TITLE_KEY_PATTERN: `branch.<name>.description`.
    const branch = record.slice('branch.'.length, newline - '.description'.length);
    const title = toTaskTitle(record.slice(newline + 1));
    if (branch && title) titles.set(branch, title);
  }
  return titles;
=======
const readBranchTitles = async (repositoryDirectory: string) => {
  const titles = new Map<string, string>();
  const result = await runGitCommand(repositoryDirectory, ['config', '-z', '--get-regexp', BRANCH_TITLE_KEY_PATTERN]);
  if (!result.success) return titles;
  for (const record of String(result.stdout || '').split('\0')) {
    const newline = record.indexOf('\n');
    if (newline <= 0) continue;
    const branch = record.slice('branch.'.length, newline - '.description'.length);
    const title = toTaskTitle(record.slice(newline + 1));
    if (branch && title) titles.set(branch, title);
  }
  return titles;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};


const BRANCH_PIN_KEY_PATTERN = '^branch\\..*\\.openchamberpinned$';
const BRANCH_PIN_KEY_SUFFIX = '.openchamberpinned';

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** Every pinned branch with the time it was pinned, in one read; a failed read pins nothing. */
const readBranchPins = async (repositoryDirectory) => {
 const pins = new Map();
 const result = await runGitCommand(repositoryDirectory, ['config', '-z', '--get-regexp', BRANCH_PIN_KEY_PATTERN]);
 if (!result.success) return pins;
 for (const record of String(result.stdout || '').split('\0')) {
  const newline = record.indexOf('\n');
  if (newline <= 0) continue;
  const branch = record.slice('branch.'.length, newline - BRANCH_PIN_KEY_SUFFIX.length);
  const pin = parseBranchPin(record.slice(newline + 1));
  if (branch && pin) pins.set(branch, pin);
 }
 return pins;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** Every pinned branch with the time it was pinned, in one read; a failed read pins nothing. */
const readBranchPins = async (repositoryDirectory) => {
  const pins = new Map();
  const result = await runGitCommand(repositoryDirectory, ['config', '-z', '--get-regexp', BRANCH_PIN_KEY_PATTERN]);
  if (!result.success) return pins;
  for (const record of String(result.stdout || '').split('\0')) {
    const newline = record.indexOf('\n');
    if (newline <= 0) continue;
    const branch = record.slice('branch.'.length, newline - BRANCH_PIN_KEY_SUFFIX.length);
    const pin = parseBranchPin(record.slice(newline + 1));
    if (branch && pin) pins.set(branch, pin);
  }
  return pins;
=======
const readBranchPins = async (repositoryDirectory: string) => {
  const pins = new Map<string, NonNullable<ReturnType<typeof parseBranchPin>>>();
  const result = await runGitCommand(repositoryDirectory, ['config', '-z', '--get-regexp', BRANCH_PIN_KEY_PATTERN]);
  if (!result.success) return pins;
  for (const record of String(result.stdout || '').split('\0')) {
    const newline = record.indexOf('\n');
    if (newline <= 0) continue;
    const branch = record.slice('branch.'.length, newline - BRANCH_PIN_KEY_SUFFIX.length);
    const pin = parseBranchPin(record.slice(newline + 1));
    if (branch && pin) pins.set(branch, pin);
  }
  return pins;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * The stored pin: the time it was pinned, then the id of the user's pin list
 * when it is filed in one (`<at> <list>`). A build that knows no lists reads
 * such a value as no pin, which leaves the worktree in its project.
 */
const parseBranchPin = (value) => {
 const [at, list] = String(value || '').trim().split(/\s+/, 2);
 const pinnedAt = Number(at);
 if (!Number.isFinite(pinnedAt) || pinnedAt <= 0) return null;
 return { pinnedAt, list: list || undefined };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * The stored pin: the time it was pinned, then the id of the user's pin list
 * when it is filed in one (`<at> <list>`). A build that knows no lists reads
 * such a value as no pin, which leaves the worktree in its project.
 */
const parseBranchPin = (value) => {
  const [at, list] = String(value || '').trim().split(/\s+/, 2);
  const pinnedAt = Number(at);
  if (!Number.isFinite(pinnedAt) || pinnedAt <= 0) return null;
  return { pinnedAt, list: list || undefined };
=======
const parseBranchPin = (value: string) => {
  const [at, list] = String(value || '').trim().split(/\s+/, 2);
  const pinnedAt = Number(at);
  if (!Number.isFinite(pinnedAt) || pinnedAt <= 0) return null;
  return { pinnedAt, list: list || undefined };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};
const PIN_LIST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Pin or unpin the task of the worktree at `directory`. A detached worktree
 * has no branch to keep the pin and is refused with 409. Clients re-list the
 * worktrees on the topology event published after a write.
 */
export async function setWorktreePinned(directory, pinned, list = null, now = Date.now()) {
 if (list !== null && !PIN_LIST_ID_PATTERN.test(list)) {
  const error = new Error('The pin list id is not valid');
  error.status = 400;
  throw error;
 }
 const directoryPath = normalizeDirectoryPath(directory);
 if (!directoryPath || !fs.existsSync(directoryPath)) {
  const error = new Error('The worktree folder does not exist');
  error.status = 404;
  throw error;
 }
 const head = await runGitCommandOrThrow(directoryPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 'The worktree is not on a branch')
  .catch((cause) => {
   const error = new Error('The worktree is not on a branch, so it cannot be pinned');
   error.status = 409;
   error.cause = cause;
   throw error;
  });
 const branch = String(head.stdout || '').trim();
 const key = `branch.${branch}.openchamberPinned`;
 const current = parseBranchPin(await readGitConfigValue(directoryPath, key));
 // Moving a pin to another list keeps the time it was first pinned.
 const next = pinned ? [String(current?.pinnedAt ?? now), ...(list ? [list] : [])].join(' ') : '';
 const stored = current ? [String(current.pinnedAt), ...(current.list ? [current.list] : [])].join(' ') : '';
 if (next !== stored) {
  await writeGitConfigValue(directoryPath, key, next);
  void publishWorktreeTopologyChange(directoryPath);
 }
 return { pinned, branch };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Pin or unpin the task of the worktree at `directory`. A detached worktree
 * has no branch to keep the pin and is refused with 409. Clients re-list the
 * worktrees on the topology event published after a write.
 */
export async function setWorktreePinned(directory, pinned, list = null, now = Date.now()) {
  if (list !== null && !PIN_LIST_ID_PATTERN.test(list)) {
    const error = new Error('The pin list id is not valid');
    error.status = 400;
    throw error;
  }
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    const error = new Error('The worktree folder does not exist');
    error.status = 404;
    throw error;
  }
  const head = await runGitCommandOrThrow(directoryPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 'The worktree is not on a branch')
    .catch((cause) => {
      const error = new Error('The worktree is not on a branch, so it cannot be pinned');
      error.status = 409;
      error.cause = cause;
      throw error;
    });
  const branch = String(head.stdout || '').trim();
  const key = `branch.${branch}.openchamberPinned`;
  const current = parseBranchPin(await readGitConfigValue(directoryPath, key));
  // Moving a pin to another list keeps the time it was first pinned.
  const next = pinned ? [String(current?.pinnedAt ?? now), ...(list ? [list] : [])].join(' ') : '';
  const stored = current ? [String(current.pinnedAt), ...(current.list ? [current.list] : [])].join(' ') : '';
  if (next !== stored) {
    await writeGitConfigValue(directoryPath, key, next);
    void publishWorktreeTopologyChange(directoryPath);
  }
  return { pinned, branch };
=======
export async function setWorktreePinned(directory: string, pinned: boolean, list: string | null = null, now = Date.now()) {
  if (list !== null && !PIN_LIST_ID_PATTERN.test(list)) {
    const error: Error & { status?: number } = new Error('The pin list id is not valid');
    error.status = 400;
    throw error;
  }
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    const error: Error & { status?: number } = new Error('The worktree folder does not exist');
    error.status = 404;
    throw error;
  }
  const head = await runGitCommandOrThrow(directoryPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 'The worktree is not on a branch')
    .catch((cause) => {
      const error: Error & { status?: number } = new Error('The worktree is not on a branch, so it cannot be pinned');
      error.status = 409;
      error.cause = cause;
      throw error;
    });
  const branch = String(head.stdout || '').trim();
  const key = `branch.${branch}.openchamberPinned`;
  const current = parseBranchPin(await readGitConfigValue(directoryPath, key));
  const next = pinned ? [String(current?.pinnedAt ?? now), ...(list ? [list] : [])].join(' ') : '';
  const stored = current ? [String(current.pinnedAt), ...(current.list ? [current.list] : [])].join(' ') : '';
  if (next !== stored) {
    await writeGitConfigValue(directoryPath, key, next);
    void publishWorktreeTopologyChange(directoryPath);
  }
  return { pinned, branch };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const readGitConfigValue = async (directory, key) => {
 const result = await runGitCommand(directory, ['config', '--get', key]);
 return result.success ? String(result.stdout || '').replace(/\r?\n$/, '') : '';
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const readGitConfigValue = async (directory, key) => {
  const result = await runGitCommand(directory, ['config', '--get', key]);
  return result.success ? String(result.stdout || '').replace(/\r?\n$/, '') : '';
=======
export async function isWorktreeDirectoryPinned(directory: string) {
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath || !fs.existsSync(directoryPath)) return false;
  const result = await runGitCommand(directoryPath, ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir', '--abbrev-ref', 'HEAD']);
  if (!result.success) return false;
  const [gitDir, commonDir, branch] = String(result.stdout || '').split(/\r?\n/);
  if (!gitDir || !commonDir || gitDir === commonDir || !branch || branch === 'HEAD') return false;
  return parseBranchPin(await readGitConfigValue(directoryPath, `branch.${branch}.openchamberPinned`)) !== null;
}

const readGitConfigValue = async (directory: string, key: string) => {
  const result = await runGitCommand(directory, ['config', '--get', key]);
  return result.success ? String(result.stdout || '').replace(/\r?\n$/, '') : '';
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

const CONFIG_LOCK_RETRY_DELAYS_MS = [50, 100, 200, 400, 800];
<<<<<<< HEAD:packages/web/server/lib/git/service.js
const isConfigLockError = (result) => /could not lock config file/i.test([result?.message, result?.stderr].filter(Boolean).join('\n'));
const runGitConfigWrite = async (directory, args) => {
 for (let attempt = 0; ; attempt += 1) {
  const result = await runGitCommand(directory, ['config', ...args]);
  const delay = CONFIG_LOCK_RETRY_DELAYS_MS[attempt];
  if (result.success || delay === undefined || !isConfigLockError(result)) return result;
  await wait(delay);
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const isConfigLockError = (result) => /could not lock config file/i.test([result?.message, result?.stderr].filter(Boolean).join('\n'));
const runGitConfigWrite = async (directory, args) => {
  for (let attempt = 0; ; attempt += 1) {
    const result = await runGitCommand(directory, ['config', ...args]);
    const delay = CONFIG_LOCK_RETRY_DELAYS_MS[attempt];
    if (result.success || delay === undefined || !isConfigLockError(result)) return result;
    await wait(delay);
  }
=======
const isConfigLockError = (result: GitCommandResult) => /could not lock config file/i.test([result?.message, result?.stderr].filter(Boolean).join('\n'));
const runGitConfigWrite = async (directory: string, args: string[]) => {
  for (let attempt = 0; ; attempt += 1) {
    const result = await runGitCommand(directory, ['config', ...args]);
    const delay = CONFIG_LOCK_RETRY_DELAYS_MS[attempt];
    if (result.success || delay === undefined || !isConfigLockError(result)) return result;
    await wait(delay);
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const writeGitConfigValue = async (directory, key, value) => {
 if (value) {
  const result = await runGitConfigWrite(directory, [key, value]);
  if (!result.success) throw new Error(result.message || `Failed to write ${key}`);
  return;
 }
 const result = await runGitConfigWrite(directory, ['--unset', key]);
 // Status 5: the key was not set, which is what unsetting asks for.
 if (!result.success && result.exitCode !== 5) throw new Error(`Failed to clear ${key}`);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const writeGitConfigValue = async (directory, key, value) => {
  if (value) {
    const result = await runGitConfigWrite(directory, [key, value]);
    if (!result.success) throw new Error(result.message || `Failed to write ${key}`);
    return;
  }
  const result = await runGitConfigWrite(directory, ['--unset', key]);
  // Status 5: the key was not set, which is what unsetting asks for.
  if (!result.success && result.exitCode !== 5) throw new Error(`Failed to clear ${key}`);
=======
const writeGitConfigValue = async (directory: string, key: string, value: string) => {
  if (value) {
    const result = await runGitConfigWrite(directory, [key, value]);
    if (!result.success) throw new Error(result.message || `Failed to write ${key}`);
    return;
  }
  const result = await runGitConfigWrite(directory, ['--unset', key]);
  if (!result.success && result.exitCode !== 5) throw new Error(`Failed to clear ${key}`);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Set the task title of the worktree at `directory`. `by: 'user'` always
 * writes (an empty title clears it) and forgets the agent's copy, so the title
 * is the user's from then on. `by: 'agent'` writes only while the branch has no
 * description or still has the one the agent set; otherwise the current title
 * is returned with `applied: false`. Clients re-list the worktrees on the
 * topology event published after a write.
 */
export async function setWorktreeTaskTitle(directory, input = {}) {
 const directoryPath = normalizeDirectoryPath(directory);
 if (!directoryPath || !fs.existsSync(directoryPath)) {
  const error = new Error('The worktree folder does not exist');
  error.status = 404;
  throw error;
 }
 const by = input?.by === 'agent' ? 'agent' : 'user';
 const title = toTaskTitle(input?.title);
 if (by === 'agent' && !title) {
  const error = new Error('title is required');
  error.status = 400;
  throw error;
 }
 const head = await runGitCommandOrThrow(directoryPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 'The worktree is not on a branch')
  .catch((cause) => {
   const error = new Error('The worktree is not on a branch, so it has no task title');
   error.status = 409;
   error.cause = cause;
   throw error;
  });
 const branch = String(head.stdout || '').trim();
 return applyBranchTaskTitle(directoryPath, branch, by, title);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Set the task title of the worktree at `directory`. `by: 'user'` always
 * writes (an empty title clears it) and forgets the agent's copy, so the title
 * is the user's from then on. `by: 'agent'` writes only while the branch has no
 * description or still has the one the agent set; otherwise the current title
 * is returned with `applied: false`. Clients re-list the worktrees on the
 * topology event published after a write.
 */
export async function setWorktreeTaskTitle(directory, input = {}) {
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    const error = new Error('The worktree folder does not exist');
    error.status = 404;
    throw error;
  }
  const by = input?.by === 'agent' ? 'agent' : 'user';
  const title = toTaskTitle(input?.title);
  if (by === 'agent' && !title) {
    const error = new Error('title is required');
    error.status = 400;
    throw error;
  }
  const head = await runGitCommandOrThrow(directoryPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 'The worktree is not on a branch')
    .catch((cause) => {
      const error = new Error('The worktree is not on a branch, so it has no task title');
      error.status = 409;
      error.cause = cause;
      throw error;
    });
  const branch = String(head.stdout || '').trim();
  return applyBranchTaskTitle(directoryPath, branch, by, title);
=======
export async function setWorktreeTaskTitle(directory: string, input: { by?: string; title?: string } = {}) {
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    const error: Error & { status?: number } = new Error('The worktree folder does not exist');
    error.status = 404;
    throw error;
  }
  const by = input?.by === 'agent' ? 'agent' : 'user';
  const title = toTaskTitle(input?.title);
  if (by === 'agent' && !title) {
    const error: Error & { status?: number } = new Error('title is required');
    error.status = 400;
    throw error;
  }
  const head = await runGitCommandOrThrow(directoryPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 'The worktree is not on a branch')
    .catch((cause) => {
      const error: Error & { status?: number } = new Error('The worktree is not on a branch, so it has no task title');
      error.status = 409;
      error.cause = cause;
      throw error;
    });
  const branch = String(head.stdout || '').trim();
  return applyBranchTaskTitle(directoryPath, branch, by, title);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Writes `title` as `branch`'s task title by the rules of
 * `setWorktreeTaskTitle`. Branch config is shared by every checkout of the
 * repository, so `directory` may be any of them, and the branch need not be
 * checked out yet.
 */
const applyBranchTaskTitle = async (directory, branch, by, title) => {
 const descriptionKey = `branch.${branch}.description`;
 const agentTitleKey = `branch.${branch}.openchamberAgentTitle`;
 const current = toTaskTitle(await readGitConfigValue(directory, descriptionKey));
 if (by === 'agent') {
  const agentTitle = toTaskTitle(await readGitConfigValue(directory, agentTitleKey));
  if (current && current !== agentTitle) return { applied: false, title: current, branch, by: 'user' };
  if (current === title) return { applied: true, title, branch, by: 'agent' };
  await writeGitConfigValue(directory, descriptionKey, title);
  await writeGitConfigValue(directory, agentTitleKey, title);
 } else {
  if (current === title && !(await readGitConfigValue(directory, agentTitleKey))) {
   return { applied: true, title, branch, by: 'user' };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Writes `title` as `branch`'s task title by the rules of
 * `setWorktreeTaskTitle`. Branch config is shared by every checkout of the
 * repository, so `directory` may be any of them, and the branch need not be
 * checked out yet.
 */
const applyBranchTaskTitle = async (directory, branch, by, title) => {
  const descriptionKey = `branch.${branch}.description`;
  const agentTitleKey = `branch.${branch}.openchamberAgentTitle`;
  const current = toTaskTitle(await readGitConfigValue(directory, descriptionKey));
  if (by === 'agent') {
    const agentTitle = toTaskTitle(await readGitConfigValue(directory, agentTitleKey));
    if (current && current !== agentTitle) return { applied: false, title: current, branch, by: 'user' };
    if (current === title) return { applied: true, title, branch, by: 'agent' };
    await writeGitConfigValue(directory, descriptionKey, title);
    await writeGitConfigValue(directory, agentTitleKey, title);
  } else {
    if (current === title && !(await readGitConfigValue(directory, agentTitleKey))) {
      return { applied: true, title, branch, by: 'user' };
    }
    await writeGitConfigValue(directory, descriptionKey, title);
    await writeGitConfigValue(directory, agentTitleKey, '');
=======
const applyBranchTaskTitle = async (directory: string, branch: string, by: string, title: string) => {
  const descriptionKey = `branch.${branch}.description`;
  const agentTitleKey = `branch.${branch}.openchamberAgentTitle`;
  const current = toTaskTitle(await readGitConfigValue(directory, descriptionKey));
  if (by === 'agent') {
    const agentTitle = toTaskTitle(await readGitConfigValue(directory, agentTitleKey));
    if (current && current !== agentTitle) return { applied: false, title: current, branch, by: 'user' };
    if (current === title) return { applied: true, title, branch, by: 'agent' };
    await writeGitConfigValue(directory, descriptionKey, title);
    await writeGitConfigValue(directory, agentTitleKey, title);
  } else {
    if (current === title && !(await readGitConfigValue(directory, agentTitleKey))) {
      return { applied: true, title, branch, by: 'user' };
    }
    await writeGitConfigValue(directory, descriptionKey, title);
    await writeGitConfigValue(directory, agentTitleKey, '');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  await writeGitConfigValue(directory, descriptionKey, title);
  await writeGitConfigValue(directory, agentTitleKey, '');
 }
 void publishWorktreeTopologyChange(directory);
 return { applied: true, title, branch, by };
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * A new worktree's first task title, from the pull request or issue it was
 * made for. It is written as the agent's: a stand-in the agent replaces with a
 * short name once it knows the task, and the user's own name still wins.
 * Best effort: a failure leaves the worktree without a title.
 */
/**
 * Records that `branch` got a name OpenChamber generated (Quick worktree's
 * `agile-chipmunk`), not one the user chose: `branch.<name>.openchamberGeneratedName`
 * holds the generated name itself, so once the branch is renamed the record,
 * which `git branch -m` carries along, no longer matches and stops applying.
 * `prefix`, the item part of an issue's branch whose key the rename keeps (`issue-180-`), is
 * recorded beside it in `openchamberGeneratedPrefix`. Best effort.
 */
export async function markGeneratedBranchName(directory, branch, prefix = null) {
 const branchName = String(branch || '').trim();
 const directoryPath = normalizeDirectoryPath(directory);
 if (!branchName || !directoryPath) return;
 const keep = String(prefix || '').trim();
 try {
  await writeGitConfigValue(directoryPath, `branch.${branchName}.openchamberGeneratedName`, branchName);
  if (keep && keep.length < branchName.length && branchName.startsWith(keep)) {
   await writeGitConfigValue(directoryPath, `branch.${branchName}.openchamberGeneratedPrefix`, keep);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * A new worktree's first task title, from the pull request or issue it was
 * made for. It is written as the agent's: a stand-in the agent replaces with a
 * short name once it knows the task, and the user's own name still wins.
 * Best effort: a failure leaves the worktree without a title.
 */
/**
 * Records that `branch` got a name OpenChamber generated (Quick worktree's
 * `agile-chipmunk`), not one the user chose: `branch.<name>.openchamberGeneratedName`
 * holds the generated name itself, so once the branch is renamed the record,
 * which `git branch -m` carries along, no longer matches and stops applying.
 * `prefix`, the item part of an issue's branch whose key the rename keeps (`issue-180-`), is
 * recorded beside it in `openchamberGeneratedPrefix`. Best effort.
 */
export async function markGeneratedBranchName(directory, branch, prefix = null) {
  const branchName = String(branch || '').trim();
  const directoryPath = normalizeDirectoryPath(directory);
  if (!branchName || !directoryPath) return;
  const keep = String(prefix || '').trim();
  try {
    await writeGitConfigValue(directoryPath, `branch.${branchName}.openchamberGeneratedName`, branchName);
    if (keep && keep.length < branchName.length && branchName.startsWith(keep)) {
      await writeGitConfigValue(directoryPath, `branch.${branchName}.openchamberGeneratedPrefix`, keep);
    }
  } catch (error) {
    console.warn('Failed to mark a generated branch name:', error instanceof Error ? error.message : String(error));
=======
export async function markGeneratedBranchName(directory: string, branch: string, prefix: string | null = null) {
  const branchName = String(branch || '').trim();
  const directoryPath = normalizeDirectoryPath(directory);
  if (!branchName || !directoryPath) return;
  const keep = String(prefix || '').trim();
  try {
    await writeGitConfigValue(directoryPath, `branch.${branchName}.openchamberGeneratedName`, branchName);
    if (keep && keep.length < branchName.length && branchName.startsWith(keep)) {
      await writeGitConfigValue(directoryPath, `branch.${branchName}.openchamberGeneratedPrefix`, keep);
    }
  } catch (error) {
    console.warn('Failed to mark a generated branch name:', error instanceof Error ? error.message : String(error));
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 } catch (error) {
  console.warn('Failed to mark a generated branch name:', error instanceof Error ? error.message : String(error));
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * The branch of the worktree at `directory` when renaming it is safe and
 * wanted: OpenChamber generated its name, and it was never pushed (no
 * upstream, no branch of that name on a remote), so no pull request or remote
 * follows it. Null otherwise, or when that cannot be read.
 */
export async function readRenameableGeneratedBranch(directory, checkedOutBranch = null) {
 const directoryPath = normalizeDirectoryPath(directory);
 if (!directoryPath) return null;
 // A caller that already read the branch saves a git run: most callers ask
 // on every message, and most branches carry no record, so one read ends it.
 let branch = String(checkedOutBranch || '').trim();
 if (!branch) {
  const head = await runGitCommand(directoryPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  branch = head.success ? String(head.stdout || '').trim() : '';
 }
 if (!branch) return null;
 if ((await readGitConfigValue(directoryPath, `branch.${branch}.openchamberGeneratedName`)).trim() !== branch) return null;
 if ((await readGitConfigValue(directoryPath, `branch.${branch}.remote`)).trim()) return null;
 const remote = await runGitCommand(directoryPath, ['for-each-ref', '--format=%(refname)', `refs/remotes/*/${branch}`]);
 if (!remote.success || String(remote.stdout || '').trim()) return null;
 return branch;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * The branch of the worktree at `directory` when renaming it is safe and
 * wanted: OpenChamber generated its name, and it was never pushed (no
 * upstream, no branch of that name on a remote), so no pull request or remote
 * follows it. Null otherwise, or when that cannot be read.
 */
export async function readRenameableGeneratedBranch(directory, checkedOutBranch = null) {
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath) return null;
  // A caller that already read the branch saves a git run: most callers ask
  // on every message, and most branches carry no record, so one read ends it.
  let branch = String(checkedOutBranch || '').trim();
  if (!branch) {
    const head = await runGitCommand(directoryPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    branch = head.success ? String(head.stdout || '').trim() : '';
  }
  if (!branch) return null;
  if ((await readGitConfigValue(directoryPath, `branch.${branch}.openchamberGeneratedName`)).trim() !== branch) return null;
  if ((await readGitConfigValue(directoryPath, `branch.${branch}.remote`)).trim()) return null;
  const remote = await runGitCommand(directoryPath, ['for-each-ref', '--format=%(refname)', `refs/remotes/*/${branch}`]);
  if (!remote.success || String(remote.stdout || '').trim()) return null;
  return branch;
=======
export async function readRenameableGeneratedBranch(directory: string, checkedOutBranch: string | null = null) {
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath) return null;
  let branch = String(checkedOutBranch || '').trim();
  if (!branch) {
    const head = await runGitCommand(directoryPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    branch = head.success ? String(head.stdout || '').trim() : '';
  }
  if (!branch) return null;
  if ((await readGitConfigValue(directoryPath, `branch.${branch}.openchamberGeneratedName`)).trim() !== branch) return null;
  if ((await readGitConfigValue(directoryPath, `branch.${branch}.remote`)).trim()) return null;
  const remote = await runGitCommand(directoryPath, ['for-each-ref', '--format=%(refname)', `refs/remotes/*/${branch}`]);
  if (!remote.success || String(remote.stdout || '').trim()) return null;
  return branch;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * The agent's branch name with the item key of a recorded prefix in front of
 * its last segment, the way trackers name an issue's branch: prefix
 * `issue-180-` and `fix/login-timeout` give `fix/180-login-timeout`, Linear's
 * `issue-ENG-12-` gives `fix/eng-12-login-timeout`, and `discussion-12-` stays
 * whole so the number is not taken for an issue's. A name that already
 * carries the key, in any place, is the agent's choice and stays as it is.
 */
const withItemKey = (requested, prefix) => {
 const key = prefix.replace(/^issue-/, '').replace(/-+$/, '').toLowerCase();
 if (!key || !requested) return requested;
 if (new RegExp(`(^|[/-])${escapeRegExp(key)}($|[/-])`, 'i').test(requested)) return requested;
 const segments = requested.split('/');
 const last = segments.pop();
 return [...segments, `${key}-${last}`].join('/');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * The agent's branch name with the item key of a recorded prefix in front of
 * its last segment, the way trackers name an issue's branch: prefix
 * `issue-180-` and `fix/login-timeout` give `fix/180-login-timeout`, Linear's
 * `issue-ENG-12-` gives `fix/eng-12-login-timeout`, and `discussion-12-` stays
 * whole so the number is not taken for an issue's. A name that already
 * carries the key, in any place, is the agent's choice and stays as it is.
 */
const withItemKey = (requested, prefix) => {
  const key = prefix.replace(/^issue-/, '').replace(/-+$/, '').toLowerCase();
  if (!key || !requested) return requested;
  if (new RegExp(`(^|[/-])${escapeRegExp(key)}($|[/-])`, 'i').test(requested)) return requested;
  const segments = requested.split('/');
  const last = segments.pop();
  return [...segments, `${key}-${last}`].join('/');
=======
const withItemKey = (requested: string, prefix: string) => {
  const key = prefix.replace(/^issue-/, '').replace(/-+$/, '').toLowerCase();
  if (!key || !requested) return requested;
  if (new RegExp(`(^|[/-])${escapeRegExp(key)}($|[/-])`, 'i').test(requested)) return requested;
  const segments = requested.split('/');
  const last = segments.pop();
  return [...segments, `${key}-${last}`].join('/');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Renames the worktree's branch to `newName` when OpenChamber generated its
 * name and it was never pushed (`readRenameableGeneratedBranch`), for
 * `work.name`. Answers `{ from, to }`, or null when the branch is not such a
 * placeholder, which then stays as it is. A name git does not accept, the
 * placeholder itself, or one already taken fails with a status. A placeholder
 * with a recorded prefix keeps its item key (`withItemKey`): `fix/login-timeout`
 * for `issue-180-merry-salamander` becomes `fix/180-login-timeout`.
 */
export async function renameGeneratedWorktreeBranch(directory, newName) {
 const directoryPath = normalizeDirectoryPath(directory);
 const current = directoryPath ? await readRenameableGeneratedBranch(directoryPath) : null;
 if (!current) return null;
 const prefix = (await readGitConfigValue(directoryPath, `branch.${current}.openchamberGeneratedPrefix`)).trim();
 const name = withItemKey(String(newName || '').trim(), prefix);
 const fail = (message, status) => Object.assign(new Error(message), { status });
 if (!name || name === current) throw fail(`Name the branch after the task, not \`${current}\``, 400);
 const valid = await runGitCommand(directoryPath, ['check-ref-format', '--branch', name]);
 if (!valid.success) throw fail(`\`${name}\` is not a valid branch name`, 400);
 await renameBranch(directoryPath, current, name).catch((error) => {
  throw fail(error instanceof Error ? error.message : String(error), error?.statusCode ?? 500);
 });
 return { from: current, to: name };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Renames the worktree's branch to `newName` when OpenChamber generated its
 * name and it was never pushed (`readRenameableGeneratedBranch`), for
 * `work.name`. Answers `{ from, to }`, or null when the branch is not such a
 * placeholder, which then stays as it is. A name git does not accept, the
 * placeholder itself, or one already taken fails with a status. A placeholder
 * with a recorded prefix keeps its item key (`withItemKey`): `fix/login-timeout`
 * for `issue-180-merry-salamander` becomes `fix/180-login-timeout`.
 */
export async function renameGeneratedWorktreeBranch(directory, newName) {
  const directoryPath = normalizeDirectoryPath(directory);
  const current = directoryPath ? await readRenameableGeneratedBranch(directoryPath) : null;
  if (!current) return null;
  const prefix = (await readGitConfigValue(directoryPath, `branch.${current}.openchamberGeneratedPrefix`)).trim();
  const name = withItemKey(String(newName || '').trim(), prefix);
  const fail = (message, status) => Object.assign(new Error(message), { status });
  if (!name || name === current) throw fail(`Name the branch after the task, not \`${current}\``, 400);
  const valid = await runGitCommand(directoryPath, ['check-ref-format', '--branch', name]);
  if (!valid.success) throw fail(`\`${name}\` is not a valid branch name`, 400);
  await renameBranch(directoryPath, current, name).catch((error) => {
    throw fail(error instanceof Error ? error.message : String(error), error?.statusCode ?? 500);
  });
  return { from: current, to: name };
=======
export async function renameGeneratedWorktreeBranch(directory: string, newName: string) {
  const directoryPath = normalizeDirectoryPath(directory);
  const current = directoryPath ? await readRenameableGeneratedBranch(directoryPath) : null;
  if (!current) return null;
  const prefix = (await readGitConfigValue(directoryPath, `branch.${current}.openchamberGeneratedPrefix`)).trim();
  const name = withItemKey(String(newName || '').trim(), prefix);
  const fail = (message: string, status: number) => Object.assign(new Error(message), { status });
  if (!name || name === current) throw fail(`Name the branch after the task, not \`${current}\``, 400);
  const valid = await runGitCommand(directoryPath, ['check-ref-format', '--branch', name]);
  if (!valid.success) throw fail(`\`${name}\` is not a valid branch name`, 400);
  await renameBranch(directoryPath, current, name).catch((error) => {
    throw fail(error instanceof Error ? error.message : String(error), error?.statusCode ?? 500);
  });
  return { from: current, to: name };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function seedBranchTaskTitle(directory, branch, rawTitle) {
 const title = toTaskTitle(rawTitle);
 const branchName = String(branch || '').trim();
 if (!title || !branchName) return;
 await applyBranchTaskTitle(normalizeDirectoryPath(directory), branchName, 'agent', title).catch((error) => {
  console.warn('Failed to seed the worktree task title:', error instanceof Error ? error.message : String(error));
 });
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function seedBranchTaskTitle(directory, branch, rawTitle) {
  const title = toTaskTitle(rawTitle);
  const branchName = String(branch || '').trim();
  if (!title || !branchName) return;
  await applyBranchTaskTitle(normalizeDirectoryPath(directory), branchName, 'agent', title).catch((error) => {
    console.warn('Failed to seed the worktree task title:', error instanceof Error ? error.message : String(error));
  });
=======
export async function seedBranchTaskTitle(directory: string, branch: string, rawTitle: string) {
  const title = toTaskTitle(rawTitle);
  const branchName = String(branch || '').trim();
  if (!title || !branchName) return;
  await applyBranchTaskTitle(normalizeDirectoryPath(directory), branchName, 'agent', title).catch((error) => {
    console.warn('Failed to seed the worktree task title:', error instanceof Error ? error.message : String(error));
  });
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}


const MAX_TRACKED_WORKTREE_DIRECTORIES = 500;
const MAX_TRACKED_WORKTREE_REPOSITORIES = 200;
const MAX_DIRECTORIES_PER_WORKTREE_REPOSITORY = 100;
const worktreeTopologyListeners = new Set<(event: WorktreeTopologyEvent) => void>();
const worktreeRepositoryKeyByDirectory = new Map<string, string>();
const worktreeTopologyByRepository = new Map<string, WorktreeTopologyEntry>();

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export function subscribeWorktreeTopologyChanges(listener) {
 worktreeTopologyListeners.add(listener);
 return () => {
  worktreeTopologyListeners.delete(listener);
 };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export function subscribeWorktreeTopologyChanges(listener) {
  worktreeTopologyListeners.add(listener);
  return () => {
    worktreeTopologyListeners.delete(listener);
  };
=======
export function subscribeWorktreeTopologyChanges(listener: (event: WorktreeTopologyEvent) => void) {
  worktreeTopologyListeners.add(listener);
  return () => {
    worktreeTopologyListeners.delete(listener);
  };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const rememberWorktreeRepositoryKey = (directoryPath, key) => {
 worktreeRepositoryKeyByDirectory.delete(directoryPath);
 worktreeRepositoryKeyByDirectory.set(directoryPath, key);
 while (worktreeRepositoryKeyByDirectory.size > MAX_TRACKED_WORKTREE_DIRECTORIES) {
  const oldest = worktreeRepositoryKeyByDirectory.keys().next().value;
  if (oldest === undefined) break;
  worktreeRepositoryKeyByDirectory.delete(oldest);
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const rememberWorktreeRepositoryKey = (directoryPath, key) => {
  worktreeRepositoryKeyByDirectory.delete(directoryPath);
  worktreeRepositoryKeyByDirectory.set(directoryPath, key);
  while (worktreeRepositoryKeyByDirectory.size > MAX_TRACKED_WORKTREE_DIRECTORIES) {
    const oldest = worktreeRepositoryKeyByDirectory.keys().next().value;
    if (oldest === undefined) break;
    worktreeRepositoryKeyByDirectory.delete(oldest);
  }
=======
const rememberWorktreeRepositoryKey = (directoryPath: string, key: string) => {
  worktreeRepositoryKeyByDirectory.delete(directoryPath);
  worktreeRepositoryKeyByDirectory.set(directoryPath, key);
  while (worktreeRepositoryKeyByDirectory.size > MAX_TRACKED_WORKTREE_DIRECTORIES) {
    const oldest = worktreeRepositoryKeyByDirectory.keys().next().value;
    if (oldest === undefined) break;
    worktreeRepositoryKeyByDirectory.delete(oldest);
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Canonical common Git directory for `directoryPath`, resolved with git once per
 * directory and cached. Returns null when git cannot answer (not a repository,
 * missing directory).
 */
const resolveWorktreeRepositoryKey = async (directoryPath) => {
 const cached = worktreeRepositoryKeyByDirectory.get(directoryPath);
 if (cached) {
  rememberWorktreeRepositoryKey(directoryPath, cached);
  return cached;
 }
 const result = await runGitCommand(directoryPath, ['rev-parse', '--git-common-dir']);
 const rawCommonDir = String(result.stdout || '').trim();
 if (!result.success || !rawCommonDir) {
  return null;
 }
 const commonDir = path.resolve(directoryPath, rawCommonDir);
 let key = commonDir;
 try {
  key = fs.realpathSync(commonDir);
 } catch {
  // Keep the resolved path; a missing common dir cannot register worktrees.
 }
 rememberWorktreeRepositoryKey(directoryPath, key);
 return key;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Canonical common Git directory for `directoryPath`, resolved with git once per
 * directory and cached. Returns null when git cannot answer (not a repository,
 * missing directory).
 */
const resolveWorktreeRepositoryKey = async (directoryPath) => {
  const cached = worktreeRepositoryKeyByDirectory.get(directoryPath);
  if (cached) {
    rememberWorktreeRepositoryKey(directoryPath, cached);
    return cached;
  }
  const result = await runGitCommand(directoryPath, ['rev-parse', '--git-common-dir']);
  const rawCommonDir = String(result.stdout || '').trim();
  if (!result.success || !rawCommonDir) {
    return null;
  }
  const commonDir = path.resolve(directoryPath, rawCommonDir);
  let key = commonDir;
  try {
    key = fs.realpathSync(commonDir);
  } catch {
    // Keep the resolved path; a missing common dir cannot register worktrees.
  }
  rememberWorktreeRepositoryKey(directoryPath, key);
  return key;
=======
const resolveWorktreeRepositoryKey = async (directoryPath: string) => {
  const cached = worktreeRepositoryKeyByDirectory.get(directoryPath);
  if (cached) {
    rememberWorktreeRepositoryKey(directoryPath, cached);
    return cached;
  }
  const result = await runGitCommand(directoryPath, ['rev-parse', '--git-common-dir']);
  const rawCommonDir = String(result.stdout || '').trim();
  if (!result.success || !rawCommonDir) {
    return null;
  }
  const commonDir = path.resolve(directoryPath, rawCommonDir);
  let key = commonDir;
  try {
    key = fs.realpathSync(commonDir);
  } catch {
    void 0;
  }
  rememberWorktreeRepositoryKey(directoryPath, key);
  return key;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Cheap identity of the registered linked-worktree set: the `worktrees`
 * directory's mtime plus its entry names. Adding, removing, or pruning a
 * worktree changes at least one of them; `git worktree move` rewrites files
 * inside an entry and is not detected.
 */
const readWorktreeTopologyFingerprint = (repositoryKey) => {
 const worktreesDir = path.join(repositoryKey, 'worktrees');
 try {
  const stat = fs.statSync(worktreesDir);
  const names = fs.readdirSync(worktreesDir).sort();
  return `${stat.mtimeMs}:${names.join('\0')}`;
 } catch {
  return 'none';
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Cheap identity of the registered linked-worktree set: the `worktrees`
 * directory's mtime, its entry names and each entry's HEAD. Adding, removing,
 * or pruning a worktree changes at least one of them, and so does renaming or
 * switching a checkout's branch; `git worktree move` rewrites other files
 * inside an entry and is not detected.
 */
const readWorktreeTopologyFingerprint = (repositoryKey) => {
  const worktreesDir = path.join(repositoryKey, 'worktrees');
  try {
    const stat = fs.statSync(worktreesDir);
    const names = fs.readdirSync(worktreesDir).sort();
    // Each checkout's HEAD names its branch, so renaming a checked-out branch
    // (`git branch -m`, as an agent does for a generated name) changes the
    // fingerprint too and the sidebar shows the new name.
    const heads = names.map((name) => {
      try {
        return fs.readFileSync(path.join(worktreesDir, name, 'HEAD'), 'utf8').trim();
      } catch {
        return '';
      }
    });
    return `${stat.mtimeMs}:${names.join('\0')}:${heads.join('\0')}`;
  } catch {
    return 'none';
  }
=======
const readWorktreeTopologyFingerprint = (repositoryKey: string) => {
  const worktreesDir = path.join(repositoryKey, 'worktrees');
  try {
    const stat = fs.statSync(worktreesDir);
    const names = fs.readdirSync(worktreesDir).sort();
    const heads = names.map((name) => {
      try {
        return fs.readFileSync(path.join(worktreesDir, name, 'HEAD'), 'utf8').trim();
      } catch {
        return '';
      }
    });
    return `${stat.mtimeMs}:${names.join('\0')}:${heads.join('\0')}`;
  } catch {
    return 'none';
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const trackWorktreeTopologyDirectory = (repositoryKey, directoryPath) => {
 let entry = worktreeTopologyByRepository.get(repositoryKey);
 if (!entry) {
  entry = { directories: new Set(), fingerprint: null };
 }
 // Re-insert so the map stays ordered by last use; the least recently used
 // repository is dropped first once the bound is reached.
 worktreeTopologyByRepository.delete(repositoryKey);
 worktreeTopologyByRepository.set(repositoryKey, entry);
 while (worktreeTopologyByRepository.size > MAX_TRACKED_WORKTREE_REPOSITORIES) {
  const oldest = worktreeTopologyByRepository.keys().next().value;
  if (oldest === undefined) break;
  worktreeTopologyByRepository.delete(oldest);
 }
 if (entry.directories.size < MAX_DIRECTORIES_PER_WORKTREE_REPOSITORY) {
  entry.directories.add(directoryPath);
 }
 return entry;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const trackWorktreeTopologyDirectory = (repositoryKey, directoryPath) => {
  let entry = worktreeTopologyByRepository.get(repositoryKey);
  if (!entry) {
    entry = { directories: new Set(), fingerprint: null };
  }
  // Re-insert so the map stays ordered by last use; the least recently used
  // repository is dropped first once the bound is reached.
  worktreeTopologyByRepository.delete(repositoryKey);
  worktreeTopologyByRepository.set(repositoryKey, entry);
  while (worktreeTopologyByRepository.size > MAX_TRACKED_WORKTREE_REPOSITORIES) {
    const oldest = worktreeTopologyByRepository.keys().next().value;
    if (oldest === undefined) break;
    worktreeTopologyByRepository.delete(oldest);
  }
  if (entry.directories.size < MAX_DIRECTORIES_PER_WORKTREE_REPOSITORY) {
    entry.directories.add(directoryPath);
  }
  return entry;
=======
const trackWorktreeTopologyDirectory = (repositoryKey: string, directoryPath: string) => {
  let entry = worktreeTopologyByRepository.get(repositoryKey);
  if (!entry) {
    entry = { directories: new Set(), fingerprint: null };
  }
  worktreeTopologyByRepository.delete(repositoryKey);
  worktreeTopologyByRepository.set(repositoryKey, entry);
  while (worktreeTopologyByRepository.size > MAX_TRACKED_WORKTREE_REPOSITORIES) {
    const oldest = worktreeTopologyByRepository.keys().next().value;
    if (oldest === undefined) break;
    worktreeTopologyByRepository.delete(oldest);
  }
  if (entry.directories.size < MAX_DIRECTORIES_PER_WORKTREE_REPOSITORY) {
    entry.directories.add(directoryPath);
  }
  return entry;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const notifyWorktreeTopologyChanged = (entry) => {
 const event = { directories: [...entry.directories], at: Date.now() };
 for (const listener of worktreeTopologyListeners) {
  try {
   listener(event);
  } catch (error) {
   console.warn('Worktree topology listener failed:', error?.message || error);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const notifyWorktreeTopologyChanged = (entry) => {
  const event = { directories: [...entry.directories], at: Date.now() };
  for (const listener of worktreeTopologyListeners) {
    try {
      listener(event);
    } catch (error) {
      console.warn('Worktree topology listener failed:', error?.message || error);
    }
=======
const notifyWorktreeTopologyChanged = (entry: WorktreeTopologyEntry) => {
  const event = { directories: [...entry.directories], at: Date.now() };
  for (const listener of worktreeTopologyListeners) {
    try {
      listener(event);
    } catch (error) {
      console.warn('Worktree topology listener failed:', errorField(error, 'message') || error);
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 }
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Compare the repository's worktree set with the last one seen for it and
 * notify listeners when it changed. The first observation only records a
 * baseline. Called from request handlers that already touch the repository;
 * never throws.
 */
export async function observeWorktreeTopology(directory) {
 const directoryPath = normalizeDirectoryPath(directory);
 if (!directoryPath) return;
 try {
  const repositoryKey = await resolveWorktreeRepositoryKey(directoryPath);
  if (!repositoryKey) return;
  const entry = trackWorktreeTopologyDirectory(repositoryKey, directoryPath);
  const fingerprint = readWorktreeTopologyFingerprint(repositoryKey);
  if (entry.fingerprint === fingerprint) return;
  const hadBaseline = entry.fingerprint !== null;
  entry.fingerprint = fingerprint;
  if (hadBaseline) notifyWorktreeTopologyChanged(entry);
 } catch (error) {
  console.warn('Failed to observe worktree topology:', error?.message || error);
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Compare the repository's worktree set with the last one seen for it and
 * notify listeners when it changed. The first observation only records a
 * baseline. Called from request handlers that already touch the repository;
 * never throws.
 */
export async function observeWorktreeTopology(directory) {
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath) return;
  try {
    const repositoryKey = await resolveWorktreeRepositoryKey(directoryPath);
    if (!repositoryKey) return;
    const entry = trackWorktreeTopologyDirectory(repositoryKey, directoryPath);
    const fingerprint = readWorktreeTopologyFingerprint(repositoryKey);
    if (entry.fingerprint === fingerprint) return;
    const hadBaseline = entry.fingerprint !== null;
    entry.fingerprint = fingerprint;
    if (hadBaseline) notifyWorktreeTopologyChanged(entry);
  } catch (error) {
    console.warn('Failed to observe worktree topology:', error?.message || error);
  }
=======
export async function observeWorktreeTopology(directory: string) {
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath) return;
  try {
    const repositoryKey = await resolveWorktreeRepositoryKey(directoryPath);
    if (!repositoryKey) return;
    const entry = trackWorktreeTopologyDirectory(repositoryKey, directoryPath);
    const fingerprint = readWorktreeTopologyFingerprint(repositoryKey);
    if (entry.fingerprint === fingerprint) return;
    const hadBaseline = entry.fingerprint !== null;
    entry.fingerprint = fingerprint;
    if (hadBaseline) notifyWorktreeTopologyChanged(entry);
  } catch (error) {
    console.warn('Failed to observe worktree topology:', errorField(error, 'message') || error);
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Record that this server changed the repository's worktree set itself and
 * notify listeners right away. `directory` is any directory inside the
 * repository; never throws so a notification problem cannot fail the
 * operation that triggered it.
 */
const publishWorktreeTopologyChange = async (directory) => {
 const directoryPath = normalizeDirectoryPath(directory);
 if (!directoryPath) return;
 try {
  const repositoryKey = await resolveWorktreeRepositoryKey(directoryPath);
  if (!repositoryKey) return;
  const entry = trackWorktreeTopologyDirectory(repositoryKey, directoryPath);
  entry.fingerprint = readWorktreeTopologyFingerprint(repositoryKey);
  notifyWorktreeTopologyChanged(entry);
 } catch (error) {
  console.warn('Failed to publish worktree topology change:', error?.message || error);
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Record that this server changed the repository's worktree set itself and
 * notify listeners right away. `directory` is any directory inside the
 * repository; never throws so a notification problem cannot fail the
 * operation that triggered it.
 */
const publishWorktreeTopologyChange = async (directory) => {
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath) return;
  try {
    const repositoryKey = await resolveWorktreeRepositoryKey(directoryPath);
    if (!repositoryKey) return;
    const entry = trackWorktreeTopologyDirectory(repositoryKey, directoryPath);
    entry.fingerprint = readWorktreeTopologyFingerprint(repositoryKey);
    notifyWorktreeTopologyChanged(entry);
  } catch (error) {
    console.warn('Failed to publish worktree topology change:', error?.message || error);
  }
=======
const publishWorktreeTopologyChange = async (directory: string) => {
  const directoryPath = normalizeDirectoryPath(directory);
  if (!directoryPath) return;
  try {
    const repositoryKey = await resolveWorktreeRepositoryKey(directoryPath);
    if (!repositoryKey) return;
    const entry = trackWorktreeTopologyDirectory(repositoryKey, directoryPath);
    entry.fingerprint = readWorktreeTopologyFingerprint(repositoryKey);
    notifyWorktreeTopologyChanged(entry);
  } catch (error) {
    console.warn('Failed to publish worktree topology change:', errorField(error, 'message') || error);
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function validateWorktreeCreate(directory, input = {}) {
 const mode = input?.mode === 'existing' ? 'existing' : 'new';
 const errors = [];
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function validateWorktreeCreate(directory, input = {}) {
  const mode = input?.mode === 'existing' ? 'existing' : 'new';
  const errors = [];
=======
export async function validateWorktreeCreate(directory: string, input: WorktreeCreateInput = {}) {
  const mode = input?.mode === 'existing' ? 'existing' : 'new';
  const errors = [];
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 try {
  const context = await resolveWorktreeProjectContext(directory);
  const preferredBranchName = cleanBranchName(String(input?.branchName || '').trim());
  const startRef = normalizeStartRef(input?.startRef);
  const ensureRemoteName = String(input?.ensureRemoteName || '').trim();
  const ensureRemoteUrl = String(input?.ensureRemoteUrl || '').trim();
  const contributorFork = input?.contributorFork === true;
  const requestedExistingBranch = String(input?.existingBranch || '').trim();
  let remoteCollision = false;
  if (contributorFork && ensureRemoteName && ensureRemoteUrl) {
   const existingRemote = await captureRemoteUrl(context.primaryWorktree, ensureRemoteName);
   remoteCollision = existingRemote.exists && existingRemote.url !== ensureRemoteUrl;
   if (remoteCollision) {
    errors.push({
     code: 'remote_name_collision',
     message: `Remote ${ensureRemoteName} already exists with a different endpoint`,
    });
   }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  try {
    const context = await resolveWorktreeProjectContext(directory);
    const preferredBranchName = cleanBranchName(String(input?.branchName || '').trim());
    const startRef = normalizeStartRef(input?.startRef);
    const ensureRemoteName = String(input?.ensureRemoteName || '').trim();
    const ensureRemoteUrl = String(input?.ensureRemoteUrl || '').trim();
    const contributorFork = input?.contributorFork === true;
    const requestedExistingBranch = String(input?.existingBranch || '').trim();
    let remoteCollision = false;
    if (contributorFork && ensureRemoteName && ensureRemoteUrl) {
      const existingRemote = await captureRemoteUrl(context.primaryWorktree, ensureRemoteName);
      remoteCollision = existingRemote.exists && existingRemote.url !== ensureRemoteUrl;
      if (remoteCollision) {
        errors.push({
          code: 'remote_name_collision',
          message: `Remote ${ensureRemoteName} already exists with a different endpoint`,
        });
      }
    }
    // A change request's head (a fork's or this repository's own) is fetched
    // after validation, so its ref cannot be checked before that.
    const contributorNeedsTransfer = (contributorFork || input?.changeRequestTransfer === true)
      && input?.contributorTransferComplete !== true;

    let localBranch = '';
    let inferredUpstream = null;

    if (mode === 'existing') {
      if (contributorNeedsTransfer) {
        errors.push({
          code: 'contributor_transfer_unavailable',
          message: 'Contributor worktree transfer requires managed credentials',
        });
      } else if (!remoteCollision) {
        try {
          const resolved = await resolveExistingWorktreeSource(context.primaryWorktree, input, 'validate');
          localBranch = resolved.localBranch || '';
          if (resolved.upstream) {
            inferredUpstream = {
              remote: resolved.upstream.remote,
              branch: resolved.upstream.branch,
            };
          }
        } catch (error) {
          errors.push({
            code: 'branch_not_found',
            message: error instanceof Error ? error.message : 'Existing branch not found',
          });
        }
      }
    } else if (contributorFork) {
      errors.push({
        code: 'contributor_transfer_unavailable',
        message: 'Contributor worktree transfer requires managed credentials',
      });
    } else {
      if (preferredBranchName) {
        const exists = await runGitCommand(context.primaryWorktree, ['show-ref', '--verify', '--quiet', `refs/heads/${preferredBranchName}`]);
        if (exists.success) {
          errors.push({
            code: 'branch_exists',
            message: `Branch already exists: ${preferredBranchName}`,
          });
        }
        localBranch = preferredBranchName;
      }

      const parsedRemoteRef = await resolveRemoteBranchRef(context.primaryWorktree, startRef);
      if (startRef && startRef !== 'HEAD') {
        if (parsedRemoteRef && ensureRemoteName && ensureRemoteUrl && ensureRemoteName === parsedRemoteRef.remote) {
          const remoteCheck = await checkLocalRemoteBranchExists(
            context.primaryWorktree,
            parsedRemoteRef.remote,
            parsedRemoteRef.branch
          );
          if (!remoteCheck.found) {
            errors.push({
              code: 'start_ref_not_found',
              message: `Remote branch is not available locally: ${parsedRemoteRef.remoteRef}`,
            });
          }
        } else if (parsedRemoteRef) {
          const remoteCheck = await ensureLocalRemoteBranchRef(
            context.primaryWorktree,
            parsedRemoteRef.remote,
            parsedRemoteRef.branch
          );
          if (!remoteCheck.found) {
            errors.push({
              code: 'start_ref_not_found',
              message: `Remote branch not found: ${parsedRemoteRef.remoteRef}`,
            });
          }
        } else {
          const startRefExists = await runGitCommand(context.primaryWorktree, ['rev-parse', '--verify', '--quiet', startRef]);
          if (!startRefExists.success) {
            errors.push({
              code: 'start_ref_not_found',
              message: `Start ref not found: ${startRef}`,
            });
          }
        }
      }

      if (parsedRemoteRef) {
        inferredUpstream = {
          remote: parsedRemoteRef.remote,
          branch: parsedRemoteRef.branch,
        };
      }
    }

    if (localBranch) {
      const inUse = await findBranchInUse(context.primaryWorktree, localBranch);
      if (inUse) {
        errors.push({
          code: 'branch_in_use',
          message: `Branch is already checked out in ${inUse.worktree}`,
        });
      }
    }

    if ((ensureRemoteName && !ensureRemoteUrl) || (!ensureRemoteName && ensureRemoteUrl)) {
      errors.push({
        code: 'invalid_remote_config',
        message: 'Both ensureRemoteName and ensureRemoteUrl are required together',
      });
    }

    const shouldSetUpstream = Boolean(input?.setUpstream);
    if (contributorFork && shouldSetUpstream) {
      errors.push({
        code: 'contributor_upstream_forbidden',
        message: 'Contributor worktrees cannot configure upstream tracking',
      });
    }
    if (shouldSetUpstream) {
      const upstreamRemote = String(input?.upstreamRemote || inferredUpstream?.remote || '').trim();
      const upstreamBranch = String(input?.upstreamBranch || inferredUpstream?.branch || '').trim();

      if (!upstreamRemote || !upstreamBranch) {
        errors.push({
          code: 'upstream_incomplete',
          message: 'upstreamRemote and upstreamBranch are required when setUpstream is true',
        });
      } else {
        const remoteExists = await runGitCommand(context.primaryWorktree, ['remote', 'get-url', '--', upstreamRemote]);
        if (!remoteExists.success && (!ensureRemoteName || ensureRemoteName !== upstreamRemote)) {
          errors.push({
            code: 'remote_not_found',
            message: `Remote not found: ${upstreamRemote}`,
          });
        }
      }
    }

    return {
      ok: errors.length === 0,
      errors,
      resolved: {
        mode,
        localBranch: localBranch || null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      errors: [{
        code: 'validation_failed',
        message: error instanceof Error ? error.message : 'Failed to validate worktree creation',
      }],
    };
=======
  try {
    const context = await resolveWorktreeProjectContext(directory);
    const preferredBranchName = cleanBranchName(String(input?.branchName || '').trim());
    const startRef = normalizeStartRef(input?.startRef);
    const ensureRemoteName = String(input?.ensureRemoteName || '').trim();
    const ensureRemoteUrl = String(input?.ensureRemoteUrl || '').trim();
    const contributorFork = input?.contributorFork === true;
    const _requestedExistingBranch = String(input?.existingBranch || '').trim();
    let remoteCollision = false;
    if (contributorFork && ensureRemoteName && ensureRemoteUrl) {
      const existingRemote = await captureRemoteUrl(context.primaryWorktree, ensureRemoteName);
      remoteCollision = existingRemote.exists && existingRemote.url !== ensureRemoteUrl;
      if (remoteCollision) {
        errors.push({
          code: 'remote_name_collision',
          message: `Remote ${ensureRemoteName} already exists with a different endpoint`,
        });
      }
    }
    const contributorNeedsTransfer = (contributorFork || input?.changeRequestTransfer === true)
      && input?.contributorTransferComplete !== true;

    let localBranch = '';
    let inferredUpstream = null;

    if (mode === 'existing') {
      if (contributorNeedsTransfer) {
        errors.push({
          code: 'contributor_transfer_unavailable',
          message: 'Contributor worktree transfer requires managed credentials',
        });
      } else if (!remoteCollision) {
        try {
          const resolved = await resolveExistingWorktreeSource(context.primaryWorktree, input, 'validate');
          localBranch = resolved.localBranch || '';
          if (resolved.upstream) {
            inferredUpstream = {
              remote: resolved.upstream.remote,
              branch: resolved.upstream.branch,
            };
          }
        } catch (error) {
          errors.push({
            code: 'branch_not_found',
            message: error instanceof Error ? error.message : 'Existing branch not found',
          });
        }
      }
    } else if (contributorFork) {
      errors.push({
        code: 'contributor_transfer_unavailable',
        message: 'Contributor worktree transfer requires managed credentials',
      });
    } else {
      if (preferredBranchName) {
        const exists = await runGitCommand(context.primaryWorktree, ['show-ref', '--verify', '--quiet', `refs/heads/${preferredBranchName}`]);
        if (exists.success) {
          errors.push({
            code: 'branch_exists',
            message: `Branch already exists: ${preferredBranchName}`,
          });
        }
        localBranch = preferredBranchName;
      }

      const parsedRemoteRef = await resolveRemoteBranchRef(context.primaryWorktree, startRef);
      if (startRef && startRef !== 'HEAD') {
        if (parsedRemoteRef && ensureRemoteName && ensureRemoteUrl && ensureRemoteName === parsedRemoteRef.remote) {
          const remoteCheck = await checkLocalRemoteBranchExists(
            context.primaryWorktree,
            parsedRemoteRef.remote,
            parsedRemoteRef.branch
          );
          if (!remoteCheck.found) {
            errors.push({
              code: 'start_ref_not_found',
              message: `Remote branch is not available locally: ${parsedRemoteRef.remoteRef}`,
            });
          }
        } else if (parsedRemoteRef) {
          const remoteCheck = await ensureLocalRemoteBranchRef(
            context.primaryWorktree,
            parsedRemoteRef.remote,
            parsedRemoteRef.branch
          );
          if (!remoteCheck.found) {
            errors.push({
              code: 'start_ref_not_found',
              message: `Remote branch not found: ${parsedRemoteRef.remoteRef}`,
            });
          }
        } else {
          const startRefExists = await runGitCommand(context.primaryWorktree, ['rev-parse', '--verify', '--quiet', startRef]);
          if (!startRefExists.success) {
            errors.push({
              code: 'start_ref_not_found',
              message: `Start ref not found: ${startRef}`,
            });
          }
        }
      }

      if (parsedRemoteRef) {
        inferredUpstream = {
          remote: parsedRemoteRef.remote,
          branch: parsedRemoteRef.branch,
        };
      }
    }

    if (localBranch) {
      const inUse = await findBranchInUse(context.primaryWorktree, localBranch);
      if (inUse) {
        errors.push({
          code: 'branch_in_use',
          message: `Branch is already checked out in ${inUse.worktree}`,
        });
      }
    }

    if ((ensureRemoteName && !ensureRemoteUrl) || (!ensureRemoteName && ensureRemoteUrl)) {
      errors.push({
        code: 'invalid_remote_config',
        message: 'Both ensureRemoteName and ensureRemoteUrl are required together',
      });
    }

    const shouldSetUpstream = Boolean(input?.setUpstream);
    if (contributorFork && shouldSetUpstream) {
      errors.push({
        code: 'contributor_upstream_forbidden',
        message: 'Contributor worktrees cannot configure upstream tracking',
      });
    }
    if (shouldSetUpstream) {
      const upstreamRemote = String(input?.upstreamRemote || inferredUpstream?.remote || '').trim();
      const upstreamBranch = String(input?.upstreamBranch || inferredUpstream?.branch || '').trim();

      if (!upstreamRemote || !upstreamBranch) {
        errors.push({
          code: 'upstream_incomplete',
          message: 'upstreamRemote and upstreamBranch are required when setUpstream is true',
        });
      } else {
        const remoteExists = await runGitCommand(context.primaryWorktree, ['remote', 'get-url', '--', upstreamRemote]);
        if (!remoteExists.success && (!ensureRemoteName || ensureRemoteName !== upstreamRemote)) {
          errors.push({
            code: 'remote_not_found',
            message: `Remote not found: ${upstreamRemote}`,
          });
        }
      }
    }

    return {
      ok: errors.length === 0,
      errors,
      resolved: {
        mode,
        localBranch: localBranch || null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      errors: [{
        code: 'validation_failed',
        message: error instanceof Error ? error.message : 'Failed to validate worktree creation',
      }],
    };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  // A change request's head (a fork's or this repository's own) is fetched
  // after validation, so its ref cannot be checked before that.
  const contributorNeedsTransfer = (contributorFork || input?.changeRequestTransfer === true)
   && input?.contributorTransferComplete !== true;

  let localBranch = '';
  let inferredUpstream = null;

  if (mode === 'existing') {
   if (contributorNeedsTransfer) {
    errors.push({
     code: 'contributor_transfer_unavailable',
     message: 'Contributor worktree transfer requires managed credentials',
    });
   } else if (!remoteCollision) {
    try {
     const resolved = await resolveExistingWorktreeSource(context.primaryWorktree, input, 'validate');
     localBranch = resolved.localBranch || '';
     if (resolved.upstream) {
      inferredUpstream = {
       remote: resolved.upstream.remote,
       branch: resolved.upstream.branch,
      };
     }
    } catch (error) {
     errors.push({
      code: 'branch_not_found',
      message: error instanceof Error ? error.message : 'Existing branch not found',
     });
    }
   }
  } else if (contributorFork) {
   errors.push({
    code: 'contributor_transfer_unavailable',
    message: 'Contributor worktree transfer requires managed credentials',
   });
  } else {
   if (preferredBranchName) {
    const exists = await runGitCommand(context.primaryWorktree, ['show-ref', '--verify', '--quiet', `refs/heads/${preferredBranchName}`]);
    if (exists.success) {
     errors.push({
      code: 'branch_exists',
      message: `Branch already exists: ${preferredBranchName}`,
     });
    }
    localBranch = preferredBranchName;
   }

   const parsedRemoteRef = await resolveRemoteBranchRef(context.primaryWorktree, startRef);
   if (startRef && startRef !== 'HEAD') {
    if (parsedRemoteRef && ensureRemoteName && ensureRemoteUrl && ensureRemoteName === parsedRemoteRef.remote) {
     const remoteCheck = await checkLocalRemoteBranchExists(
      context.primaryWorktree,
      parsedRemoteRef.remote,
      parsedRemoteRef.branch
     );
     if (!remoteCheck.found) {
      errors.push({
       code: 'start_ref_not_found',
       message: `Remote branch is not available locally: ${parsedRemoteRef.remoteRef}`,
      });
     }
    } else if (parsedRemoteRef) {
     const remoteCheck = await checkLocalRemoteBranchExists(
      context.primaryWorktree,
      parsedRemoteRef.remote,
      parsedRemoteRef.branch
     );
     if (!remoteCheck.found) {
      errors.push({
       code: 'start_ref_not_found',
       message: `Remote branch is not available locally: ${parsedRemoteRef.remoteRef}`,
      });
     }
    } else {
     const startRefExists = await runGitCommand(context.primaryWorktree, ['rev-parse', '--verify', '--quiet', startRef]);
     if (!startRefExists.success) {
      errors.push({
       code: 'start_ref_not_found',
       message: `Start ref not found: ${startRef}`,
      });
     }
    }
   }

   if (parsedRemoteRef) {
    inferredUpstream = {
     remote: parsedRemoteRef.remote,
     branch: parsedRemoteRef.branch,
    };
   }
  }

  if (localBranch) {
   const inUse = await findBranchInUse(context.primaryWorktree, localBranch);
   if (inUse) {
    errors.push({
     code: 'branch_in_use',
     message: `Branch is already checked out in ${inUse.worktree}`,
    });
   }
  }

  if ((ensureRemoteName && !ensureRemoteUrl) || (!ensureRemoteName && ensureRemoteUrl)) {
   errors.push({
    code: 'invalid_remote_config',
    message: 'Both ensureRemoteName and ensureRemoteUrl are required together',
   });
  }

  const shouldSetUpstream = Boolean(input?.setUpstream);
  if (contributorFork && shouldSetUpstream) {
   errors.push({
    code: 'contributor_upstream_forbidden',
    message: 'Contributor worktrees cannot configure upstream tracking',
   });
  }
  if (shouldSetUpstream) {
   const upstreamRemote = String(input?.upstreamRemote || inferredUpstream?.remote || '').trim();
   const upstreamBranch = String(input?.upstreamBranch || inferredUpstream?.branch || '').trim();

   if (!upstreamRemote || !upstreamBranch) {
    errors.push({
     code: 'upstream_incomplete',
     message: 'upstreamRemote and upstreamBranch are required when setUpstream is true',
    });
   } else {
    const remoteExists = await runGitCommand(context.primaryWorktree, ['remote', 'get-url', '--', upstreamRemote]);
    if (!remoteExists.success && (!ensureRemoteName || ensureRemoteName !== upstreamRemote)) {
     errors.push({
      code: 'remote_not_found',
      message: `Remote not found: ${upstreamRemote}`,
     });
    }
   }
  }

  return {
   ok: errors.length === 0,
   errors,
   resolved: {
    mode,
    localBranch: localBranch || null,
   },
  };
 } catch (error) {
  return {
   ok: false,
   errors: [{
    code: 'validation_failed',
    message: error instanceof Error ? error.message : 'Failed to validate worktree creation',
   }],
  };
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const assertWorktreeCreatePreflight = async (directory, input = {}) => {
 const validation = await validateWorktreeCreate(directory, input);
 if (validation?.ok) {
  return;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const assertWorktreeCreatePreflight = async (directory, input = {}) => {
  const validation = await validateWorktreeCreate(directory, input);
  if (validation?.ok) {
    return;
  }
=======
const assertWorktreeCreatePreflight = async (directory: string, input: WorktreeCreateInput = {}) => {
  const validation = await validateWorktreeCreate(directory, input);
  if (validation?.ok) {
    return;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const message = validation?.errors
  ?.map((error) => error?.message)
  .filter(Boolean)
  .join('\n') || 'Failed to validate worktree creation';
 const collision = validation?.errors?.find((error) => error?.code === 'remote_name_collision');
 if (collision) {
  throw Object.assign(new Error(collision.message), {
   code: 'CONTRIBUTOR_REMOTE_COLLISION',
   status: 409,
   remoteName: String(input?.ensureRemoteName || '').trim(),
  });
 }
 if (validation?.errors?.some((error) => error?.code === 'contributor_transfer_unavailable')) {
  throw Object.assign(new Error('Contributor worktree transfer requires managed credentials'), {
   code: 'CONTRIBUTOR_MANAGED_TRANSFER_REQUIRED', status: 409,
  });
 }
 throw new Error(message);
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function previewWorktreeCreate(directory, input = {}) {
 const mode = input?.mode === 'existing' ? 'existing' : 'new';
 const context = await resolveWorktreeProjectContext(directory);
 await fsp.mkdir(context.worktreeRoot, { recursive: true });
 context.worktreeRoot = await fsp.realpath(context.worktreeRoot);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function previewWorktreeCreate(directory, input = {}) {
  const mode = input?.mode === 'existing' ? 'existing' : 'new';
  const context = await resolveWorktreeProjectContext(directory);
  await fsp.mkdir(context.worktreeRoot, { recursive: true });
  context.worktreeRoot = await fsp.realpath(context.worktreeRoot);
=======
export async function previewWorktreeCreate(directory: string, input: WorktreeCreateInput = {}) {
  const mode = input?.mode === 'existing' ? 'existing' : 'new';
  const context = await resolveWorktreeProjectContext(directory);
  await fsp.mkdir(context.worktreeRoot, { recursive: true });
  context.worktreeRoot = await fsp.realpath(context.worktreeRoot);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const preferredName = String(input?.worktreeName || input?.name || '').trim();
 const preferredBranchName = cleanBranchName(String(input?.branchName || '').trim());
 const candidate = await resolveCandidateDirectory(
  context.worktreeRoot,
  preferredName,
  mode === 'new' && preferredBranchName ? preferredBranchName : '',
  context.primaryWorktree
 );

 return {
  name: candidate.name,
  branch: mode === 'new' ? candidate.branch : preferredBranchName,
  path: candidate.directory,
 };
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const readLocalBranchTip = async (primaryWorktree, branch) => {
 const result = await runGitCommand(primaryWorktree, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`]);
 return result.success ? String(result.stdout || '').trim() : '';
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const readLocalBranchTip = async (primaryWorktree, branch) => {
  const result = await runGitCommand(primaryWorktree, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`]);
  return result.success ? String(result.stdout || '').trim() : '';
=======
const readLocalBranchTip = async (primaryWorktree: string, branch: string) => {
  const result = await runGitCommand(primaryWorktree, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`]);
  return result.success ? String(result.stdout || '').trim() : '';
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * A change request's local branch can be left over from an earlier worktree
 * of it that was removed. That branch is reused and moved to the change
 * request head. When it diverged from the head (the head was force-pushed),
 * its old tip is first kept in `<branch>-backup-<sha>`, so no commit becomes
 * unreachable. Returns null when there is no such branch or it is checked out
 * elsewhere, which the ordinary creation checks report.
 */
const prepareChangeRequestLocalBranch = async (primaryWorktree, input = {}) => {
 const expectedRevision = String(input?.expectedRevision || '').trim();
 if (input?.changeRequestTransfer !== true || !expectedRevision) return null;
 const remoteRef = await resolveRemoteBranchRef(primaryWorktree, String(input?.existingBranch || '').trim());
 const branch = cleanBranchName(String(input?.branchName || '').trim() || remoteRef?.branch || '');
 if (!remoteRef || !branch) return null;
 const tip = await readLocalBranchTip(primaryWorktree, branch);
 if (!tip || await findBranchInUse(primaryWorktree, branch)) return null;
 if (await isAncestorRef(primaryWorktree, tip, expectedRevision)) return { branch, tip, backupBranch: null };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * A change request's local branch can be left over from an earlier worktree
 * of it that was removed. That branch is reused and moved to the change
 * request head. When it diverged from the head (the head was force-pushed),
 * its old tip is first kept in `<branch>-backup-<sha>`, so no commit becomes
 * unreachable. Returns null when there is no such branch or it is checked out
 * elsewhere, which the ordinary creation checks report.
 */
const prepareChangeRequestLocalBranch = async (primaryWorktree, input = {}) => {
  const expectedRevision = String(input?.expectedRevision || '').trim();
  if (input?.changeRequestTransfer !== true || !expectedRevision) return null;
  const remoteRef = await resolveRemoteBranchRef(primaryWorktree, String(input?.existingBranch || '').trim());
  const branch = cleanBranchName(String(input?.branchName || '').trim() || remoteRef?.branch || '');
  if (!remoteRef || !branch) return null;
  const tip = await readLocalBranchTip(primaryWorktree, branch);
  if (!tip || await findBranchInUse(primaryWorktree, branch)) return null;
  if (await isAncestorRef(primaryWorktree, tip, expectedRevision)) return { branch, tip, backupBranch: null };
=======
const prepareChangeRequestLocalBranch = async (primaryWorktree: string, input: WorktreeCreateInput = {}) => {
  const expectedRevision = String(input?.expectedRevision || '').trim();
  if (input?.changeRequestTransfer !== true || !expectedRevision) return null;
  const remoteRef = await resolveRemoteBranchRef(primaryWorktree, String(input?.existingBranch || '').trim());
  const branch = cleanBranchName(String(input?.branchName || '').trim() || remoteRef?.branch || '');
  if (!remoteRef || !branch) return null;
  const tip = await readLocalBranchTip(primaryWorktree, branch);
  if (!tip || await findBranchInUse(primaryWorktree, branch)) return null;
  if (await isAncestorRef(primaryWorktree, tip, expectedRevision)) return { branch, tip, backupBranch: null };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const backupBranch = `${branch}-backup-${tip.slice(0, 7)}`;
 const backupTip = await readLocalBranchTip(primaryWorktree, backupBranch);
 if (backupTip && backupTip !== tip) {
  throw new Error(`Branch ${branch} has commits the change request no longer has, and ${backupBranch} already exists`);
 }
 if (!backupTip) {
  await runGitCommandOrThrow(primaryWorktree, ['branch', '--no-track', backupBranch, tip], `Failed to keep ${branch} as ${backupBranch}`);
 }
 return { branch, tip, backupBranch };
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
async function attachGitWorktreeToCandidateWithoutRemoteRollback(context, candidate, input = {}, serverOptions = {}) {
 const mode = input?.mode === 'existing' ? 'existing' : 'new';
 const startRef = normalizeStartRef(input?.startRef);
 let ensureRemoteName = String(input?.ensureRemoteName || '').trim();
 let ensureRemoteUrl = String(input?.ensureRemoteUrl || '').trim();
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
async function attachGitWorktreeToCandidateWithoutRemoteRollback(context, candidate, input = {}, serverOptions = {}) {
  const mode = input?.mode === 'existing' ? 'existing' : 'new';
  const startRef = normalizeStartRef(input?.startRef);
  let ensureRemoteName = String(input?.ensureRemoteName || '').trim();
  let ensureRemoteUrl = String(input?.ensureRemoteUrl || '').trim();
=======
const branchNameClashesWithExistingRef = async (primaryWorktree: string, branchName: string) => {
  const segments = String(branchName || '').split('/').filter(Boolean);
  if (segments.length === 0) return false;
  const candidates = segments.map((_, index) => `refs/heads/${segments.slice(0, index + 1).join('/')}`);
  const target = candidates[candidates.length - 1];
  const result = await runGitCommand(primaryWorktree, ['for-each-ref', '--format=%(refname)', ...candidates]);
  if (!result.success) return false;
  return String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).some((ref) => (
    candidates.includes(ref) || ref.startsWith(`${target}/`)
  ));
};

async function attachGitWorktreeToCandidateWithoutRemoteRollback(context: WorktreeProjectContext, candidate: WorktreeCandidate, input: WorktreeCreateInput = {}, serverOptions: WorktreeServerOptions = {}) {
  const mode = input?.mode === 'existing' ? 'existing' : 'new';
  const startRef = normalizeStartRef(input?.startRef);
  const ensureRemoteName = String(input?.ensureRemoteName || '').trim();
  const ensureRemoteUrl = String(input?.ensureRemoteUrl || '').trim();
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 let localBranch = '';
 let inferredUpstream = null;
 let shouldSetUpstream = input?.contributorFork === true ? false : Boolean(input?.setUpstream);
 let checkoutRemoteName = '';
 let parsedStartBranch = null;
 const expectedRevision = String(input?.expectedRevision || '').trim();
 const contributorFork = input?.contributorFork === true;
 const contributorSource = serverOptions.contributorSource;
 if (contributorFork && (!ensureRemoteName || !ensureRemoteUrl || !expectedRevision
  || !contributorSource || !(serverOptions.contributorProvenance?.compareAndSwap instanceof Function))) {
  throw Object.assign(new Error('Contributor worktree provenance requirements are incomplete'), {
   code: 'INVALID_CONTRIBUTOR_WORKTREE', status: 400,
  });
 }
 let createdLocalBranch = false;
 // A leftover change request branch this attempt moves; a failed attempt puts it back.
 let movedLocalBranch = null;
 const worktreeAddArgs = ['worktree', 'add', '--no-checkout'];
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  let localBranch = '';
  let inferredUpstream = null;
  let shouldSetUpstream = input?.contributorFork === true ? false : Boolean(input?.setUpstream);
  let checkoutRemoteName = '';
  const expectedRevision = String(input?.expectedRevision || '').trim();
  const contributorFork = input?.contributorFork === true;
  const contributorSource = serverOptions.contributorSource;
  if (contributorFork && (!ensureRemoteName || !ensureRemoteUrl || !expectedRevision
    || !contributorSource || !(serverOptions.contributorProvenance?.compareAndSwap instanceof Function))) {
    throw Object.assign(new Error('Contributor worktree provenance requirements are incomplete'), {
      code: 'INVALID_CONTRIBUTOR_WORKTREE', status: 400,
    });
  }
  let createdLocalBranch = false;
  // The branch a new branch starts from, when it starts from a remote one.
  let parsedStartBranch = null;
  // A leftover change request branch this attempt moves; a failed attempt puts it back.
  let movedLocalBranch = null;
  const worktreeAddArgs = ['worktree', 'add', '--no-checkout'];
=======
  let localBranch = '';
  let inferredUpstream = null;
  let shouldSetUpstream = input?.contributorFork === true ? false : Boolean(input?.setUpstream);
  let checkoutRemoteName = '';
  const expectedRevision = String(input?.expectedRevision || '').trim();
  const contributorFork = input?.contributorFork === true;
  const contributorSource = serverOptions.contributorSource;
  if (contributorFork && (!ensureRemoteName || !ensureRemoteUrl || !expectedRevision
    || !contributorSource || !(serverOptions.contributorProvenance?.compareAndSwap instanceof Function))) {
    throw Object.assign(new Error('Contributor worktree provenance requirements are incomplete'), {
      code: 'INVALID_CONTRIBUTOR_WORKTREE', status: 400,
    });
  }
  let createdLocalBranch = false;
  let parsedStartBranch = null;
  let movedLocalBranch = null;
  const worktreeAddArgs = ['worktree', 'add', '--no-checkout'];
  const createCommand = contributorFork ? '' : String(input?.createCommand || '').trim();
  let branchStart: BranchStart | null = null;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 if (mode === 'existing') {
  const resolved = await resolveExistingWorktreeSource(context.primaryWorktree, input, 'create');
  localBranch = resolved.localBranch;
  shouldSetUpstream = resolved.setUpstream;

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  const inUse = await findBranchInUse(context.primaryWorktree, localBranch);
  if (inUse) {
   throw new Error(`Branch is already checked out in ${inUse.worktree}`);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    const inUse = await findBranchInUse(context.primaryWorktree, localBranch);
    if (inUse) {
      throw new Error(`Branch is already checked out in ${inUse.worktree}`);
    }

    const reusedBranch = serverOptions.changeRequestLocalBranch;
    if (resolved.createLocalBranch && reusedBranch?.branch === localBranch) {
      if (await readLocalBranchTip(context.primaryWorktree, localBranch) !== reusedBranch.tip) {
        throw new Error(`Branch ${localBranch} changed during worktree creation`);
      }
      worktreeAddArgs.push('-B', localBranch);
      movedLocalBranch = reusedBranch;
    } else if (resolved.createLocalBranch) {
      worktreeAddArgs.push('-b', localBranch);
      createdLocalBranch = true;
    }
    worktreeAddArgs.push(candidate.directory, expectedRevision && resolved.createLocalBranch
      ? expectedRevision
      : resolved.checkoutRef);
    if (movedLocalBranch && contributorFork) {
      // The leftover branch may still track something; contributor worktrees never do.
      await runGitCommand(context.primaryWorktree, ['config', '--unset-all', `branch.${localBranch}.remote`]);
      await runGitCommand(context.primaryWorktree, ['config', '--unset-all', `branch.${localBranch}.merge`]);
    }

    if (resolved.upstream) {
      inferredUpstream = {
        remote: resolved.upstream.remote,
        branch: resolved.upstream.branch,
      };
    }
    if (resolved.createLocalBranch && resolved.upstream
      && (contributorFork || (ensureRemoteName && ensureRemoteUrl))) {
      checkoutRemoteName = resolved.upstream.remote;
    }
  } else {
    localBranch = candidate.branch;
    if (!localBranch) {
      throw new Error('Failed to resolve branch name for new worktree');
    }

    const branchExists = await runGitCommand(context.primaryWorktree, ['show-ref', '--verify', '--quiet', `refs/heads/${localBranch}`]);
    if (branchExists.success) {
      throw new Error(`Branch already exists: ${localBranch}`);
    }

    const inUse = await findBranchInUse(context.primaryWorktree, localBranch);
    if (inUse) {
      throw new Error(`Branch is already checked out in ${inUse.worktree}`);
    }

    worktreeAddArgs.push('-b', localBranch, candidate.directory);
    if (startRef && startRef !== 'HEAD') {
      worktreeAddArgs.push(startRef);
    }

    const parsedRemoteStartRef = await resolveRemoteBranchRef(context.primaryWorktree, startRef);
    if (parsedRemoteStartRef) {
      parsedStartBranch = parsedRemoteStartRef.branch;
      worktreeAddArgs.splice(2, 0, '--no-track');
      inferredUpstream = {
        remote: parsedRemoteStartRef.remote,
        branch: parsedRemoteStartRef.branch,
      };
      checkoutRemoteName = parsedRemoteStartRef.remote;
    }
=======
    const inUse = await findBranchInUse(context.primaryWorktree, localBranch);
    if (inUse) {
      throw new Error(`Branch is already checked out in ${inUse.worktree}`);
    }

    const reusedBranch = serverOptions.changeRequestLocalBranch;
    if (resolved.createLocalBranch && reusedBranch?.branch === localBranch) {
      if (await readLocalBranchTip(context.primaryWorktree, localBranch) !== reusedBranch.tip) {
        throw new Error(`Branch ${localBranch} changed during worktree creation`);
      }
      worktreeAddArgs.push('-B', localBranch);
      movedLocalBranch = reusedBranch;
    } else if (resolved.createLocalBranch) {
      worktreeAddArgs.push('-b', localBranch);
      createdLocalBranch = true;
    }
    const checkoutStart = expectedRevision && resolved.createLocalBranch
      ? expectedRevision
      : resolved.checkoutRef;
    worktreeAddArgs.push(candidate.directory, checkoutStart);
    if (resolved.createLocalBranch) branchStart = { start: checkoutStart, force: Boolean(movedLocalBranch) };
    if (movedLocalBranch && contributorFork) {
      await runGitCommand(context.primaryWorktree, ['config', '--unset-all', `branch.${localBranch}.remote`]);
      await runGitCommand(context.primaryWorktree, ['config', '--unset-all', `branch.${localBranch}.merge`]);
    }

    if (resolved.upstream) {
      inferredUpstream = {
        remote: resolved.upstream.remote,
        branch: resolved.upstream.branch,
      };
    }
    if (resolved.createLocalBranch && resolved.upstream
      && (contributorFork || (ensureRemoteName && ensureRemoteUrl))) {
      checkoutRemoteName = resolved.upstream.remote;
    }
  } else {
    localBranch = candidate.branch;
    if (!localBranch) {
      throw new Error('Failed to resolve branch name for new worktree');
    }

    const branchExists = await runGitCommand(context.primaryWorktree, ['show-ref', '--verify', '--quiet', `refs/heads/${localBranch}`]);
    if (branchExists.success) {
      throw new Error(`Branch already exists: ${localBranch}`);
    }

    const inUse = await findBranchInUse(context.primaryWorktree, localBranch);
    if (inUse) {
      throw new Error(`Branch is already checked out in ${inUse.worktree}`);
    }

    worktreeAddArgs.push('-b', localBranch, candidate.directory);
    if (startRef && startRef !== 'HEAD') {
      worktreeAddArgs.push(startRef);
    }

    const parsedRemoteStartRef = await resolveRemoteBranchRef(context.primaryWorktree, startRef);
    if (parsedRemoteStartRef) {
      parsedStartBranch = parsedRemoteStartRef.branch;
      worktreeAddArgs.splice(2, 0, '--no-track');
      inferredUpstream = {
        remote: parsedRemoteStartRef.remote,
        branch: parsedRemoteStartRef.branch,
      };
      checkoutRemoteName = parsedRemoteStartRef.remote;
    }
    branchStart = { start: startRef && startRef !== 'HEAD' ? startRef : 'HEAD', noTrack: Boolean(parsedRemoteStartRef) };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

  const reusedBranch = serverOptions.changeRequestLocalBranch;
  if (resolved.createLocalBranch && reusedBranch?.branch === localBranch) {
   if (await readLocalBranchTip(context.primaryWorktree, localBranch) !== reusedBranch.tip) {
    throw new Error(`Branch ${localBranch} changed during worktree creation`);
   }
   worktreeAddArgs.push('-B', localBranch);
   movedLocalBranch = reusedBranch;
  } else if (resolved.createLocalBranch) {
   worktreeAddArgs.push('-b', localBranch);
   createdLocalBranch = true;
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
  worktreeAddArgs.push(candidate.directory, expectedRevision && resolved.createLocalBranch
   ? expectedRevision
   : resolved.checkoutRef);
  if (movedLocalBranch && contributorFork) {
   // The leftover branch may still track something; contributor worktrees never do.
   await runGitCommand(context.primaryWorktree, ['config', '--unset-all', `branch.${localBranch}.remote`]);
   await runGitCommand(context.primaryWorktree, ['config', '--unset-all', `branch.${localBranch}.merge`]);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  if (!checkoutRemoteName) {
    checkoutRemoteName = await resolveCheckoutRemoteName(context.primaryWorktree, mode === 'existing' ? localBranch : startRef);
=======
  if (!checkoutRemoteName) {
    checkoutRemoteName = await resolveCheckoutRemoteName(context.primaryWorktree, mode === 'existing' ? localBranch : startRef) ?? '';
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  if (resolved.upstream) {
   inferredUpstream = {
    remote: resolved.upstream.remote,
    branch: resolved.upstream.branch,
   };
  }
  if (resolved.createLocalBranch && resolved.upstream
   && (contributorFork || (ensureRemoteName && ensureRemoteUrl))) {
   checkoutRemoteName = resolved.upstream.remote;
  }
 } else {
  localBranch = candidate.branch;
  if (!localBranch) {
   throw new Error('Failed to resolve branch name for new worktree');
  }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  await runGitCommandOrThrow(context.primaryWorktree, worktreeAddArgs, 'Failed to create git worktree');
  await publishWorktreeTopologyChange(context.primaryWorktree);
  // A new branch's parent is the branch it starts from, a lower layer of a
  // stack included; its pull request and comparisons default to it.
  if (mode === 'new' && startRef && startRef !== 'HEAD') {
    const parent = parsedStartBranch ?? await localBranchNameOf(context.primaryWorktree, startRef);
    await recordBranchParent(context.primaryWorktree, localBranch, parent);
  }
=======
  const branchNameConflict = (mode === 'new' || createdLocalBranch)
    && await branchNameClashesWithExistingRef(context.primaryWorktree, localBranch);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  const branchExists = await runGitCommand(context.primaryWorktree, ['show-ref', '--verify', '--quiet', `refs/heads/${localBranch}`]);
  if (branchExists.success) {
   throw new Error(`Branch already exists: ${localBranch}`);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  // Undoes what this attempt did to the local branch, once its worktree is removed.
  const releaseLocalBranch = async () => {
    if (createdLocalBranch) return (await runGitCommand(context.primaryWorktree, ['branch', '-D', localBranch])).success;
    if (movedLocalBranch) {
      return (await runGitCommand(context.primaryWorktree, ['branch', '-f', localBranch, movedLocalBranch.tip])).success;
    }
    return true;
  };

  if (expectedRevision) {
    const createdHead = await runGitCommand(candidate.directory, ['rev-parse', '--verify', 'HEAD']);
    if (!createdHead.success || String(createdHead.stdout || '').trim() !== expectedRevision) {
      const removed = await runGitCommand(context.primaryWorktree, ['worktree', 'remove', '--force', candidate.directory]);
      if (removed.success && !(await releaseLocalBranch())) {
        throw new Error('Created worktree revision does not match the requested change request head, and the local branch could not be restored safely');
      }
      if (!removed.success) {
        throw new Error('Created worktree revision does not match the requested change request head, and the worktree could not be removed safely');
      }
      throw new Error('Created worktree revision does not match the requested change request head');
    }
=======
  const releaseLocalBranch = async () => {
    if (createdLocalBranch) return (await runGitCommand(context.primaryWorktree, ['branch', '-D', localBranch])).success;
    if (movedLocalBranch) {
      return (await runGitCommand(context.primaryWorktree, ['branch', '-f', localBranch, movedLocalBranch.tip])).success;
    }
    return true;
  };

  try {
    if (createCommand) {
      const directory = await createWorktreeWithCommand({
        primaryWorktree: context.primaryWorktree,
        directory: candidate.directory,
        branch: localBranch,
        branchStart,
        command: createCommand,
      }).catch(async (error) => {
        if (error?.branchMade && !(await findBranchInUse(context.primaryWorktree, localBranch))) {
          if (mode === 'new') await runGitCommand(context.primaryWorktree, ['branch', '-D', localBranch]);
          else await releaseLocalBranch();
        }
        throw error;
      });
      candidate = { ...candidate, directory };
    } else {
      await runGitCommandOrThrow(context.primaryWorktree, worktreeAddArgs, 'Failed to create git worktree');
    }
  } catch (error) {
    if (branchNameConflict && !errorField(error, 'code')) {
      if (!hasErrorFields(error)) throw error;
      throw Object.assign(error, { code: 'BRANCH_NAME_CONFLICT' });
    }
    throw error;
  }
  await publishWorktreeTopologyChange(context.primaryWorktree);
  if (mode === 'new' && startRef && startRef !== 'HEAD') {
    const parent = parsedStartBranch ?? await localBranchNameOf(context.primaryWorktree, startRef);
    await recordBranchParent(context.primaryWorktree, localBranch, parent);
  }

  if (expectedRevision) {
    const createdHead = await runGitCommand(candidate.directory, ['rev-parse', '--verify', 'HEAD']);
    if (!createdHead.success || String(createdHead.stdout || '').trim() !== expectedRevision) {
      const removed = await runGitCommand(context.primaryWorktree, ['worktree', 'remove', '--force', candidate.directory]);
      if (removed.success && !(await releaseLocalBranch())) {
        throw new Error('Created worktree revision does not match the requested change request head, and the local branch could not be restored safely');
      }
      if (!removed.success) {
        throw new Error('Created worktree revision does not match the requested change request head, and the worktree could not be removed safely');
      }
      throw new Error('Created worktree revision does not match the requested change request head');
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  const inUse = await findBranchInUse(context.primaryWorktree, localBranch);
  if (inUse) {
   throw new Error(`Branch is already checked out in ${inUse.worktree}`);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  let provenanceRecord = null;
  if (contributorFork) {
    try {
      provenanceRecord = await serverOptions.contributorProvenance.compareAndSwap(candidate.directory, 0, {
        kind: 'contributor-fork',
        remoteName: ensureRemoteName,
        endpointFingerprint: fingerprintRemoteUrl(ensureRemoteUrl),
        sourceSha: expectedRevision.toLowerCase(),
        sourceRef: contributorSource.headRef,
        sourceProjectId: contributorSource.sourceProject.id,
        targetProjectId: contributorSource.targetProject.id,
        provider: contributorSource.context.provider,
        instance: contributorSource.context.instance,
        accountId: contributorSource.context.accountId,
        bindingRevision: contributorSource.context.bindingRevision,
        primaryRemote: contributorSource.context.primaryRemote,
        projectId: context.projectID,
        setupCommand: String(input?.startCommand || '').trim(),
      });
    } catch (error) {
      const removed = await runGitCommand(context.primaryWorktree, ['worktree', 'remove', '--force', candidate.directory]);
      if (removed.success) await releaseLocalBranch();
      throw error;
    }
=======
  let provenanceRecord = null;
  if (contributorFork && contributorSource && serverOptions.contributorProvenance) {
    try {
      provenanceRecord = await serverOptions.contributorProvenance.compareAndSwap(candidate.directory, 0, {
        kind: 'contributor-fork',
        remoteName: ensureRemoteName,
        endpointFingerprint: fingerprintRemoteUrl(ensureRemoteUrl),
        sourceSha: expectedRevision.toLowerCase(),
        sourceRef: contributorSource.headRef,
        sourceProjectId: contributorSource.sourceProject.id,
        targetProjectId: contributorSource.targetProject.id,
        provider: contributorSource.context.provider,
        instance: contributorSource.context.instance,
        accountId: contributorSource.context.accountId,
        bindingRevision: contributorSource.context.bindingRevision,
        primaryRemote: contributorSource.context.primaryRemote,
        projectId: context.projectID,
        setupCommand: String(input?.startCommand || '').trim(),
      });
    } catch (error) {
      const removed = await runGitCommand(context.primaryWorktree, ['worktree', 'remove', '--force', candidate.directory]);
      if (removed.success) await releaseLocalBranch();
      throw error;
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

  worktreeAddArgs.push('-b', localBranch, candidate.directory);
  if (startRef && startRef !== 'HEAD') {
   worktreeAddArgs.push(startRef);
  }

  const parsedRemoteStartRef = await resolveRemoteBranchRef(context.primaryWorktree, startRef);
  if (parsedRemoteStartRef) {
   worktreeAddArgs.splice(2, 0, '--no-track');
   inferredUpstream = {
    remote: parsedRemoteStartRef.remote,
    branch: parsedRemoteStartRef.branch,
   };
   checkoutRemoteName = parsedRemoteStartRef.remote;
   parsedStartBranch = parsedRemoteStartRef.branch;
  }
 }

 if (mode === 'existing' && ensureRemoteName && ensureRemoteUrl) {
  await ensureRemoteWithUrlUnlocked(context.primaryWorktree, ensureRemoteName, ensureRemoteUrl);
 }
 if (!checkoutRemoteName) {
  checkoutRemoteName = await resolveCheckoutRemoteName(context.primaryWorktree, mode === 'existing' ? localBranch : startRef);
 }

 await runGitCommandOrThrow(context.primaryWorktree, worktreeAddArgs, 'Failed to create git worktree');
 await publishWorktreeTopologyChange(context.primaryWorktree);
 // A new branch's parent is the branch it starts from, a lower layer of a
 // stack included; its pull request and comparisons default to it.
 if (mode === 'new' && startRef && startRef !== 'HEAD') {
  const parent = parsedStartBranch ?? await localBranchNameOf(context.primaryWorktree, startRef);
  await recordBranchParent(context.primaryWorktree, localBranch, parent);
 }

 // Undoes what this attempt did to the local branch, once its worktree is removed.
 const releaseLocalBranch = async () => {
  if (createdLocalBranch) return (await runGitCommand(context.primaryWorktree, ['branch', '-D', localBranch])).success;
  if (movedLocalBranch) {
   return (await runGitCommand(context.primaryWorktree, ['branch', '-f', localBranch, movedLocalBranch.tip])).success;
  }
  return true;
 };

 if (expectedRevision) {
  const createdHead = await runGitCommand(candidate.directory, ['rev-parse', '--verify', 'HEAD']);
  if (!createdHead.success || String(createdHead.stdout || '').trim() !== expectedRevision) {
   const removed = await runGitCommand(context.primaryWorktree, ['worktree', 'remove', '--force', candidate.directory]);
   if (removed.success && !(await releaseLocalBranch())) {
    throw new Error('Created worktree revision does not match the requested change request head, and the local branch could not be restored safely');
   }
   if (!removed.success) {
    throw new Error('Created worktree revision does not match the requested change request head, and the worktree could not be removed safely');
   }
   throw new Error('Created worktree revision does not match the requested change request head');
  }
 }

 let provenanceRecord = null;
 if (contributorFork) {
  try {
   provenanceRecord = await serverOptions.contributorProvenance.compareAndSwap(candidate.directory, 0, {
    kind: 'contributor-fork',
    remoteName: ensureRemoteName,
    endpointFingerprint: fingerprintRemoteUrl(ensureRemoteUrl),
    sourceSha: expectedRevision.toLowerCase(),
    sourceRef: contributorSource.headRef,
    sourceProjectId: contributorSource.sourceProject.id,
    targetProjectId: contributorSource.targetProject.id,
    provider: contributorSource.context.provider,
    instance: contributorSource.context.instance,
    accountId: contributorSource.context.accountId,
    bindingRevision: contributorSource.context.bindingRevision,
    primaryRemote: contributorSource.context.primaryRemote,
    projectId: context.projectID,
    setupCommand: String(input?.startCommand || '').trim(),
   });
  } catch (error) {
<<<<<<< HEAD:packages/web/server/lib/git/service.js
   const removed = await runGitCommand(context.primaryWorktree, ['worktree', 'remove', '--force', candidate.directory]);
   if (removed.success) await releaseLocalBranch();
   throw error;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    if (error?.code !== 'WORKTREE_BOOTSTRAP_PERSISTENCE_FAILED') throw error;
    bootstrapStatus = error.bootstrapStatus;
=======
    if (!isBootstrapPersistenceFailure(error)) throw error;
    bootstrapStatus = error.bootstrapStatus;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const upstreamRemote = shouldSetUpstream
  ? String(input?.upstreamRemote || inferredUpstream?.remote || '').trim()
  : '';
 const upstreamBranch = shouldSetUpstream
  ? String(input?.upstreamBranch || inferredUpstream?.branch || '').trim()
  : '';
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  if (bootstrapStatus.status === WORKTREE_BOOTSTRAP_PENDING) {
    queueWorktreeBootstrap({
      directory: candidate.directory,
      projectDirectory: context.requestedDirectory,
      primaryWorktree: context.primaryWorktree,
      localBranch,
      setUpstream: shouldSetUpstream,
      upstreamRemote,
      upstreamBranch,
      ensureRemoteName,
      ensureRemoteUrl,
      startCommand: input?.startCommand,
      contributorFork,
      hydrateCheckout: serverOptions.hydrateCheckout,
      checkoutRemoteName,
      bootstrapStore: serverOptions.bootstrapStore,
    });
  }
=======
  if (bootstrapStatus === null) throw new TypeError('Missing worktree bootstrap state');
  if (bootstrapStatus.status === WORKTREE_BOOTSTRAP_PENDING) {
    queueWorktreeBootstrap({
      directory: candidate.directory,
      projectDirectory: context.requestedDirectory,
      primaryWorktree: context.primaryWorktree,
      localBranch,
      setUpstream: shouldSetUpstream,
      upstreamRemote,
      upstreamBranch,
      ensureRemoteName,
      ensureRemoteUrl,
      startCommand: input?.startCommand,
      contributorFork,
      hydrateCheckout: serverOptions.hydrateCheckout,
      checkoutRemoteName,
      bootstrapStore: serverOptions.bootstrapStore,
      populated: Boolean(createCommand),
    });
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 let bootstrapStatus;
 try {
  bootstrapStatus = await setWorktreeBootstrapState(
   candidate.directory,
   WORKTREE_BOOTSTRAP_PENDING,
   WORKTREE_BOOTSTRAP_PHASE_DIRECTORY_CREATED,
   null,
   undefined,
   undefined,
   serverOptions.bootstrapStore,
  );
 } catch (error) {
  if (error?.code !== 'WORKTREE_BOOTSTRAP_PERSISTENCE_FAILED') throw error;
  bootstrapStatus = error.bootstrapStatus;
 }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 if (bootstrapStatus.status === WORKTREE_BOOTSTRAP_PENDING) {
  queueWorktreeBootstrap({
   directory: candidate.directory,
   primaryWorktree: context.primaryWorktree,
   localBranch,
   setUpstream: shouldSetUpstream,
   upstreamRemote,
   upstreamBranch,
   ensureRemoteName,
   ensureRemoteUrl,
   startCommand: input?.startCommand,
   contributorFork,
   hydrateCheckout: serverOptions.hydrateCheckout,
   checkoutRemoteName,
   bootstrapStore: serverOptions.bootstrapStore,
  });
 }

 const headResult = await runGitCommand(candidate.directory, ['rev-parse', 'HEAD']);
 const head = String(headResult.stdout || '').trim();

 const result = {
  head,
  name: candidate.name,
  branch: localBranch,
  path: candidate.directory,
  directoryCreated: true,
  bootstrapStatus,
 };
 if (provenanceRecord) {
  result.provenance = {
   kind: 'contributor-fork',
   revision: provenanceRecord.revision,
   trust: 'untrusted',
   push: 'destination-selection-required',
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const result = {
    head,
    name: candidate.name,
    branch: localBranch,
    path: candidate.directory,
    directoryCreated: true,
    bootstrapStatus,
=======
  const result: WorktreeCreateResult = {
    head,
    name: candidate.name,
    branch: localBranch,
    path: candidate.directory,
    directoryCreated: true,
    bootstrapStatus,
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  };
 }
 return result;
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
async function attachGitWorktreeToCandidate(context, candidate, input = {}, serverOptions = {}) {
 const remoteName = String(input?.ensureRemoteName || '').trim();
 const remoteUrl = String(input?.ensureRemoteUrl || '').trim();
 if (!remoteName || !remoteUrl) {
  return attachGitWorktreeToCandidateWithoutRemoteRollback(context, candidate, input, serverOptions);
 }
 return withRemoteProvisioningQueue(context.primaryWorktree, remoteName, async () => {
  const previous = await captureRemoteUrl(context.primaryWorktree, remoteName);
  try {
   return await attachGitWorktreeToCandidateWithoutRemoteRollback(context, candidate, input, serverOptions);
  } catch (error) {
   if (previous.exists && previous.url !== remoteUrl) throw error;
   try {
    await restoreProvisionedRemote(context.primaryWorktree, remoteName, remoteUrl, previous);
   } catch (rollbackError) {
    const detail = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
    throw new Error(`${error instanceof Error ? error.message : String(error)}, and the provisioned remote could not be restored: ${detail}`);
   }
   throw error;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
async function attachGitWorktreeToCandidate(context, candidate, input = {}, serverOptions = {}) {
  const remoteName = String(input?.ensureRemoteName || '').trim();
  const remoteUrl = String(input?.ensureRemoteUrl || '').trim();
  if (!remoteName || !remoteUrl) {
    return attachGitWorktreeToCandidateWithoutRemoteRollback(context, candidate, input, serverOptions);
=======
async function attachGitWorktreeToCandidate(context: WorktreeProjectContext, candidate: WorktreeCandidate, input: WorktreeCreateInput = {}, serverOptions: WorktreeServerOptions = {}) {
  const remoteName = String(input?.ensureRemoteName || '').trim();
  const remoteUrl = String(input?.ensureRemoteUrl || '').trim();
  if (!remoteName || !remoteUrl) {
    return attachGitWorktreeToCandidateWithoutRemoteRollback(context, candidate, input, serverOptions);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 });
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Refreshes one remote-tracking ref before a worktree is created from it.
// This is server-internal maintenance of an already-configured remote, not a
// user-initiated transfer, so it stays outside the planned-operation flow.
const fetchRemoteBranchRef = async (primaryWorktree, remoteName, branchName) => {
 const remote = String(remoteName || '').trim();
 const branch = String(branchName || '').trim();
 if (!remote || !branch) {
  return;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Refreshes one remote-tracking ref before a worktree is created from it.
// This is server-internal maintenance of an already-configured remote, not a
// user-initiated transfer, so it stays outside the planned-operation flow.
const fetchRemoteBranchRef = async (primaryWorktree, remoteName, branchName) => {
  const remote = String(remoteName || '').trim();
  const branch = String(branchName || '').trim();
  if (!remote || !branch) {
    return;
  }
=======
const fetchRemoteBranchRef = async (primaryWorktree: string, remoteName: string, branchName: string) => {
  const remote = String(remoteName || '').trim();
  const branch = String(branchName || '').trim();
  if (!remote || !branch) {
    return;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const refspec = `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`;
 await runGitCommandOrThrow(
  primaryWorktree,
  ['fetch', '--', remote, refspec],
  `Failed to fetch ${remote}/${branch}`
 );
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const isAncestorRef = async (cwd, ancestor, descendant) => {
 const result = await runGitCommand(cwd, ['merge-base', '--is-ancestor', ancestor, descendant]);
 return result.success;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const isAncestorRef = async (cwd, ancestor, descendant) => {
  const result = await runGitCommand(cwd, ['merge-base', '--is-ancestor', ancestor, descendant]);
  return result.success;
=======
const isAncestorRef = async (cwd: string, ancestor: string, descendant: string) => {
  const result = await runGitCommand(cwd, ['merge-base', '--is-ancestor', ancestor, descendant]);
  return result.success;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * The upstream of a local branch whose commits are all published, or null.
 *
 * Only the standard remote-tracking layout qualifies
 * (`refs/remotes/<remote>/<branch>`), because that is the ref
 * `fetchRemoteBranchRef` refreshes.
 */
const resolvePublishedLocalBranchUpstream = async (primaryWorktree, startRef) => {
 const branch = String(startRef || '').trim().replace(/^refs\/heads\//, '');
 if (!branch || branch === 'HEAD') return null;
 const localRef = `refs/heads/${branch}`;
 const refs = await runGitCommand(primaryWorktree, [
  'for-each-ref',
  '--format=%(refname)%00%(upstream)%00%(upstream:remotename)%00%(upstream:remoteref)',
  localRef,
 ]);
 if (!refs.success) return null;
 const line = refs.stdout.split('\n').find((entry) => entry.startsWith(`${localRef}\0`));
 if (!line) return null;
 const [, trackingRef, remote, remoteRef] = line.split('\0');
 const remoteBranch = String(remoteRef || '').replace(/^refs\/heads\//, '');
 if (!remote || !remoteBranch || trackingRef !== `refs/remotes/${remote}/${remoteBranch}`) return null;
 if (!(await isAncestorRef(primaryWorktree, localRef, trackingRef))) return null;
 return { remote, branch: remoteBranch, localRef, trackingRef };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * The upstream of a local branch whose commits are all published, or null.
 *
 * Only the standard remote-tracking layout qualifies
 * (`refs/remotes/<remote>/<branch>`), because that is the ref
 * `fetchRemoteBranchRef` refreshes.
 */
const resolvePublishedLocalBranchUpstream = async (primaryWorktree, startRef) => {
  const branch = String(startRef || '').trim().replace(/^refs\/heads\//, '');
  if (!branch || branch === 'HEAD') return null;
  const localRef = `refs/heads/${branch}`;
  const refs = await runGitCommand(primaryWorktree, [
    'for-each-ref',
    '--format=%(refname)%00%(upstream)%00%(upstream:remotename)%00%(upstream:remoteref)',
    localRef,
  ]);
  if (!refs.success) return null;
  const line = refs.stdout.split('\n').find((entry) => entry.startsWith(`${localRef}\0`));
  if (!line) return null;
  const [, trackingRef, remote, remoteRef] = line.split('\0');
  const remoteBranch = String(remoteRef || '').replace(/^refs\/heads\//, '');
  if (!remote || !remoteBranch || trackingRef !== `refs/remotes/${remote}/${remoteBranch}`) return null;
  if (!(await isAncestorRef(primaryWorktree, localRef, trackingRef))) return null;
  return { remote, branch: remoteBranch, localRef, trackingRef };
=======
const resolvePublishedLocalBranchUpstream = async (primaryWorktree: string, startRef: string) => {
  const branch = String(startRef || '').trim().replace(/^refs\/heads\//, '');
  if (!branch || branch === 'HEAD') return null;
  const localRef = `refs/heads/${branch}`;
  const refs = await runGitCommand(primaryWorktree, [
    'for-each-ref',
    '--format=%(refname)%00%(upstream)%00%(upstream:remotename)%00%(upstream:remoteref)',
    localRef,
  ]);
  if (!refs.success) return null;
  const line = refs.stdout.split('\n').find((entry) => entry.startsWith(`${localRef}\0`));
  if (!line) return null;
  const [, trackingRef, remote, remoteRef] = line.split('\0');
  const remoteBranch = String(remoteRef || '').replace(/^refs\/heads\//, '');
  if (!remote || !remoteBranch || trackingRef !== `refs/remotes/${remote}/${remoteBranch}`) return null;
  if (!(await isAncestorRef(primaryWorktree, localRef, trackingRef))) return null;
  return { remote, branch: remoteBranch, localRef, trackingRef };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * A local base branch with nothing unpublished starts the worktree from its
 * freshly fetched upstream, so the worktree includes what was pushed since
 * the last pull. The local branch itself is never moved. A branch with
 * unpublished commits, or an upstream that no longer contains the local
 * commits after the fetch (a force-push), keeps the local ref; a failed fetch
 * keeps it too and says so.
 */
// Why a fetch for a new worktree failed, when the user can do something about
// it: the repository's access (an account that needs attention, refused
// credentials). Anything else is left unnamed.
const sourceFetchFailure = (error) => {
 const message = error instanceof Error ? error.message : String(error ?? '');
 const access = error?.reason === 'needs-attention' || error?.code === 'AUTHENTICATION_REQUIRED'
  || /authentication failed|could not read username|permission denied/i.test(message);
 return access ? { sourceFetchFailed: true, sourceFetchReason: 'access' } : { sourceFetchFailed: true };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * A local base branch with nothing unpublished starts the worktree from its
 * freshly fetched upstream, so the worktree includes what was pushed since
 * the last pull. The local branch itself is never moved. A branch with
 * unpublished commits, or an upstream that no longer contains the local
 * commits after the fetch (a force-push), keeps the local ref; a failed fetch
 * keeps it too and says so.
 */
// Why a fetch for a new worktree failed, when the user can do something about
// it: the repository's access (an account that needs attention, refused
// credentials). Anything else is left unnamed.
const sourceFetchFailure = (error) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const access = error?.reason === 'needs-attention' || error?.code === 'AUTHENTICATION_REQUIRED'
    || /authentication failed|could not read username|permission denied/i.test(message);
  return access ? { sourceFetchFailed: true, sourceFetchReason: 'access' } : { sourceFetchFailed: true };
=======
const sourceFetchFailure = <Failure>(error: Failure) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const access = errorField(error, 'reason') === 'needs-attention' || errorField(error, 'code') === 'AUTHENTICATION_REQUIRED'
    || /authentication failed|could not read username|permission denied/i.test(message);
  return access ? { sourceFetchFailed: true, sourceFetchReason: 'access' } : { sourceFetchFailed: true };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const preparePublishedLocalBranchSource = async (context, input, startRef) => {
 const upstream = await resolvePublishedLocalBranchUpstream(context.primaryWorktree, startRef);
 if (!upstream) return { input, sourceFetchFailed: false };
 try {
  await fetchRemoteBranchRef(context.primaryWorktree, upstream.remote, upstream.branch);
 } catch (error) {
  return { input, ...sourceFetchFailure(error) };
 }
 if (!(await isAncestorRef(context.primaryWorktree, upstream.localRef, upstream.trackingRef))) {
  return { input, sourceFetchFailed: false };
 }
 return {
  input: { ...input, startRef: `remotes/${upstream.remote}/${upstream.branch}` },
  sourceFetchFailed: false,
 };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const preparePublishedLocalBranchSource = async (context, input, startRef) => {
  const upstream = await resolvePublishedLocalBranchUpstream(context.primaryWorktree, startRef);
  if (!upstream) return { input, sourceFetchFailed: false };
  try {
    await fetchRemoteBranchRef(context.primaryWorktree, upstream.remote, upstream.branch);
  } catch (error) {
    return { input, ...sourceFetchFailure(error) };
  }
  if (!(await isAncestorRef(context.primaryWorktree, upstream.localRef, upstream.trackingRef))) {
    return { input, sourceFetchFailed: false };
  }
  return {
    input: { ...input, startRef: `remotes/${upstream.remote}/${upstream.branch}` },
    sourceFetchFailed: false,
  };
=======
const preparePublishedLocalBranchSource = async (context: WorktreeProjectContext, input: WorktreeCreateInput, startRef: string) => {
  const upstream = await resolvePublishedLocalBranchUpstream(context.primaryWorktree, startRef);
  if (!upstream) return { input, sourceFetchFailed: false };
  try {
    await fetchRemoteBranchRef(context.primaryWorktree, upstream.remote, upstream.branch);
  } catch (error) {
    return { input, ...sourceFetchFailure(error) };
  }
  if (!(await isAncestorRef(context.primaryWorktree, upstream.localRef, upstream.trackingRef))) {
    return { input, sourceFetchFailed: false };
  }
  return {
    input: { ...input, startRef: `remotes/${upstream.remote}/${upstream.branch}` },
    sourceFetchFailed: false,
  };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const prepareWorktreeCreateSource = async (context, input = {}) => {
 if (input?.mode === 'existing') {
  return { input, sourceFetchFailed: false };
 }

 const startRef = normalizeStartRef(input?.startRef);
 const remoteStartRef = await resolveRemoteBranchRef(context.primaryWorktree, startRef);
 if (!remoteStartRef) {
  return preparePublishedLocalBranchSource(context, input, startRef);
 }

 const status = await getStatus(context.primaryWorktree, { mode: 'light' }).catch(() => null);
 const trackingRef = status?.tracking
  ? await resolveRemoteBranchRef(context.primaryWorktree, status.tracking)
  : null;
 const canFallbackToLocal = Boolean(
  status?.current
  && status.ahead === 0
  && trackingRef?.fullRef === remoteStartRef.fullRef
 );

 try {
  await fetchRemoteBranchRef(context.primaryWorktree, remoteStartRef.remote, remoteStartRef.branch);
  return { input, sourceFetchFailed: false };
 } catch (error) {
  if (canFallbackToLocal) {
   return {
    input: { ...input, startRef: status.current },
    ...sourceFetchFailure(error),
   };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const prepareWorktreeCreateSource = async (context, input = {}) => {
  if (input?.mode === 'existing') {
    return { input, sourceFetchFailed: false };
=======
const prepareWorktreeCreateSource = async (context: WorktreeProjectContext, input: WorktreeCreateInput = {}) => {
  if (input?.mode === 'existing') {
    return { input, sourceFetchFailed: false };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

  const refExists = await runGitCommand(
   context.primaryWorktree,
   ['show-ref', '--verify', '--quiet', remoteStartRef.fullRef]
  );
<<<<<<< HEAD:packages/web/server/lib/git/service.js
  if (!refExists.success) {
   throw error;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js

  try {
    await fetchRemoteBranchRef(context.primaryWorktree, remoteStartRef.remote, remoteStartRef.branch);
    return { input, sourceFetchFailed: false };
  } catch (error) {
    if (canFallbackToLocal) {
      return {
        input: { ...input, startRef: status.current },
        ...sourceFetchFailure(error),
      };
    }

    const refExists = await runGitCommand(
      context.primaryWorktree,
      ['show-ref', '--verify', '--quiet', remoteStartRef.fullRef]
    );
    if (!refExists.success) {
      throw error;
    }
    console.warn(`Worktree create: failed to refresh ${remoteStartRef.remote}/${remoteStartRef.branch}, proceeding with the existing remote-tracking ref`);
    return { input, sourceFetchFailed: false };
=======

  try {
    await fetchRemoteBranchRef(context.primaryWorktree, remoteStartRef.remote, remoteStartRef.branch);
    return { input, sourceFetchFailed: false };
  } catch (error) {
    if (canFallbackToLocal) {
      return {
        input: { ...input, startRef: status?.current ?? null },
        ...sourceFetchFailure(error),
      };
    }

    const refExists = await runGitCommand(
      context.primaryWorktree,
      ['show-ref', '--verify', '--quiet', remoteStartRef.fullRef]
    );
    if (!refExists.success) {
      throw error;
    }
    console.warn(`Worktree create: failed to refresh ${remoteStartRef.remote}/${remoteStartRef.branch}, proceeding with the existing remote-tracking ref`);
    return { input, sourceFetchFailed: false };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  console.warn(`Worktree create: failed to refresh ${remoteStartRef.remote}/${remoteStartRef.branch}, proceeding with the existing remote-tracking ref`);
  return { input, sourceFetchFailed: false };
 }
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function createWorktree(directory, input = {}, serverOptions = {}) {
 const mode = input?.mode === 'existing' ? 'existing' : 'new';
 const context = await resolveWorktreeProjectContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function createWorktree(directory, input = {}, serverOptions = {}) {
  const mode = input?.mode === 'existing' ? 'existing' : 'new';
  const context = await resolveWorktreeProjectContext(directory);
=======
export async function createWorktree(directory: string, input: WorktreeCreateInput = {}, serverOptions: WorktreeServerOptions = {}) {
  const mode = input?.mode === 'existing' ? 'existing' : 'new';
  const context = await resolveWorktreeProjectContext(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 if (input?.returnAfterDirectoryCreated === true || input?.contributorFork === true) {
  await assertWorktreeCreatePreflight(directory, input);
 }

 // Only the non-existing path consults a remote before the attach step, and
 // only that path needs the remote provisioned this early. In existing mode
 // the attach step provisions it inside the rollback scope, so a failed
 // creation cannot leave a contributor remote behind.
 const ensureRemoteName = String(input?.ensureRemoteName || '').trim();
 const ensureRemoteUrl = String(input?.ensureRemoteUrl || '').trim();
 if (mode !== 'existing' && ensureRemoteName && ensureRemoteUrl) {
  await ensureRemoteWithUrl(context.primaryWorktree, ensureRemoteName, ensureRemoteUrl);
 }
 const prepared = await prepareWorktreeCreateSource(context, input);
 const preparedInput = prepared.input;
 const changeRequestLocalBranch = mode === 'existing'
  ? await prepareChangeRequestLocalBranch(context.primaryWorktree, preparedInput)
  : null;
 const attachOptions = changeRequestLocalBranch ? { ...serverOptions, changeRequestLocalBranch } : serverOptions;
 // Tells the user where a diverged leftover branch's commits went.
 const withBranchBackup = (result) => (changeRequestLocalBranch?.backupBranch
  ? { ...result, branchBackup: changeRequestLocalBranch.backupBranch }
  : result);

 await fsp.mkdir(context.worktreeRoot, { recursive: true });
 context.worktreeRoot = await fsp.realpath(context.worktreeRoot);

 const preferredName = String(preparedInput?.worktreeName || preparedInput?.name || '').trim();
 const preferredBranchName = cleanBranchName(String(preparedInput?.branchName || '').trim());

 const candidate = await resolveCandidateDirectory(
  context.worktreeRoot,
  preferredName,
  mode === 'new' && preferredBranchName ? preferredBranchName : '',
  context.primaryWorktree
 );

 if (preparedInput?.returnAfterDirectoryCreated === true && preparedInput?.contributorFork !== true) {
  await fsp.mkdir(candidate.directory, { recursive: false });

  let bootstrapStatus;
  try {
   bootstrapStatus = await setWorktreeBootstrapState(
    candidate.directory,
    WORKTREE_BOOTSTRAP_PENDING,
    WORKTREE_BOOTSTRAP_PHASE_DIRECTORY_CREATED,
    null,
    undefined,
    undefined,
    serverOptions.bootstrapStore,
   );
  } catch (error) {
   if (error?.code !== 'WORKTREE_BOOTSTRAP_PERSISTENCE_FAILED') throw error;
   bootstrapStatus = error.bootstrapStatus;
  }
  const localBranch = mode === 'existing'
   ? cleanBranchName(String(preparedInput?.branchName || preparedInput?.existingBranch || candidate.branch || '').trim())
   : candidate.branch;

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  const task = bootstrapStatus.status === WORKTREE_BOOTSTRAP_PENDING
   ? attachGitWorktreeToCandidate(context, candidate, preparedInput, attachOptions).catch(async (error) => {
    await setWorktreeBootstrapState(
     candidate.directory,
     WORKTREE_BOOTSTRAP_FAILED,
     WORKTREE_BOOTSTRAP_PHASE_DIRECTORY_CREATED,
     'Worktree creation failed. Inspect the checkout and repair it before use.',
     undefined,
     'UNKNOWN',
     serverOptions.bootstrapStore,
    ).catch(() => { });
    await cleanupFailedFastWorktreeCreate(context, candidate);
    console.warn('Background worktree creation failed:', error instanceof Error ? error.message : String(error));
   })
   : null;
  if (task) trackWorktreeBootstrapTask(candidate.directory, task);

  const result = {
   head: '',
   name: candidate.name,
   branch: localBranch,
   path: candidate.directory,
   directoryCreated: true,
   bootstrapStatus,
  };
  if (prepared.sourceFetchFailed) {
   result.sourceFetchFailed = true;
   if (prepared.sourceFetchReason) result.sourceFetchReason = prepared.sourceFetchReason;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  // Only the non-existing path consults a remote before the attach step, and
  // only that path needs the remote provisioned this early. In existing mode
  // the attach step provisions it inside the rollback scope, so a failed
  // creation cannot leave a contributor remote behind.
  const ensureRemoteName = String(input?.ensureRemoteName || '').trim();
  const ensureRemoteUrl = String(input?.ensureRemoteUrl || '').trim();
  if (mode !== 'existing' && ensureRemoteName && ensureRemoteUrl) {
    await ensureRemoteWithUrl(context.primaryWorktree, ensureRemoteName, ensureRemoteUrl);
=======
  const ensureRemoteName = String(input?.ensureRemoteName || '').trim();
  const ensureRemoteUrl = String(input?.ensureRemoteUrl || '').trim();
  if (mode !== 'existing' && ensureRemoteName && ensureRemoteUrl) {
    await ensureRemoteWithUrl(context.primaryWorktree, ensureRemoteName, ensureRemoteUrl);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
  return withBranchBackup(result);
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const prepared = await prepareWorktreeCreateSource(context, input);
  const preparedInput = prepared.input;
  const changeRequestLocalBranch = mode === 'existing'
    ? await prepareChangeRequestLocalBranch(context.primaryWorktree, preparedInput)
    : null;
  const attachOptions = changeRequestLocalBranch ? { ...serverOptions, changeRequestLocalBranch } : serverOptions;
  // Tells the user where a diverged leftover branch's commits went.
  const withBranchBackup = (result) => (changeRequestLocalBranch?.backupBranch
    ? { ...result, branchBackup: changeRequestLocalBranch.backupBranch }
    : result);
=======
  const prepared = await prepareWorktreeCreateSource(context, input);
  const preparedInput = prepared.input;
  const changeRequestLocalBranch = mode === 'existing'
    ? await prepareChangeRequestLocalBranch(context.primaryWorktree, preparedInput)
    : null;
  const attachOptions = changeRequestLocalBranch ? { ...serverOptions, changeRequestLocalBranch } : serverOptions;
  const withBranchBackup = (result: WorktreeCreateResult) => (changeRequestLocalBranch?.backupBranch
    ? { ...result, branchBackup: changeRequestLocalBranch.backupBranch }
    : result);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const result = withBranchBackup(await attachGitWorktreeToCandidate(context, candidate, preparedInput, attachOptions));
 if (!prepared.sourceFetchFailed) return result;
 return prepared.sourceFetchReason
  ? { ...result, sourceFetchFailed: true, sourceFetchReason: prepared.sourceFetchReason }
  : { ...result, sourceFetchFailed: true };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  await fsp.mkdir(context.worktreeRoot, { recursive: true });
  context.worktreeRoot = await fsp.realpath(context.worktreeRoot);

  const preferredName = String(preparedInput?.worktreeName || preparedInput?.name || '').trim();
  const preferredBranchName = cleanBranchName(String(preparedInput?.branchName || '').trim());

  const candidate = await resolveCandidateDirectory(
    context.worktreeRoot,
    preferredName,
    mode === 'new' && preferredBranchName ? preferredBranchName : '',
    context.primaryWorktree
  );

  if (preparedInput?.returnAfterDirectoryCreated === true && preparedInput?.contributorFork !== true) {
    await fsp.mkdir(candidate.directory, { recursive: false });

    let bootstrapStatus;
    try {
      bootstrapStatus = await setWorktreeBootstrapState(
        candidate.directory,
        WORKTREE_BOOTSTRAP_PENDING,
        WORKTREE_BOOTSTRAP_PHASE_DIRECTORY_CREATED,
        null,
        undefined,
        undefined,
        serverOptions.bootstrapStore,
      );
    } catch (error) {
      if (error?.code !== 'WORKTREE_BOOTSTRAP_PERSISTENCE_FAILED') throw error;
      bootstrapStatus = error.bootstrapStatus;
    }
    const localBranch = mode === 'existing'
      ? cleanBranchName(String(preparedInput?.branchName || preparedInput?.existingBranch || candidate.branch || '').trim())
      : candidate.branch;

    const task = bootstrapStatus.status === WORKTREE_BOOTSTRAP_PENDING
      ? attachGitWorktreeToCandidate(context, candidate, preparedInput, attachOptions).catch(async (error) => {
      await setWorktreeBootstrapState(
        candidate.directory,
        WORKTREE_BOOTSTRAP_FAILED,
        WORKTREE_BOOTSTRAP_PHASE_DIRECTORY_CREATED,
        'Worktree creation failed. Inspect the checkout and repair it before use.',
        undefined,
        'UNKNOWN',
        serverOptions.bootstrapStore,
      ).catch(() => {});
      await cleanupFailedFastWorktreeCreate(context, candidate);
      console.warn('Background worktree creation failed:', error instanceof Error ? error.message : String(error));
      })
      : null;
    if (task) trackWorktreeBootstrapTask(candidate.directory, task);

    const result = {
      head: '',
      name: candidate.name,
      branch: localBranch,
      path: candidate.directory,
      directoryCreated: true,
      bootstrapStatus,
    };
    if (prepared.sourceFetchFailed) {
      result.sourceFetchFailed = true;
      if (prepared.sourceFetchReason) result.sourceFetchReason = prepared.sourceFetchReason;
    }
    return withBranchBackup(result);
  }

  const result = withBranchBackup(await attachGitWorktreeToCandidate(context, candidate, preparedInput, attachOptions));
  if (!prepared.sourceFetchFailed) return result;
  return prepared.sourceFetchReason
    ? { ...result, sourceFetchFailed: true, sourceFetchReason: prepared.sourceFetchReason }
    : { ...result, sourceFetchFailed: true };
=======
  await fsp.mkdir(context.worktreeRoot, { recursive: true });
  context.worktreeRoot = await fsp.realpath(context.worktreeRoot);

  const preferredName = String(preparedInput?.worktreeName || preparedInput?.name || '').trim();
  const preferredBranchName = cleanBranchName(String(preparedInput?.branchName || '').trim());

  const candidate = await resolveCandidateDirectory(
    context.worktreeRoot,
    preferredName,
    mode === 'new' && preferredBranchName ? preferredBranchName : '',
    context.primaryWorktree
  );

  const usesCreateCommand = preparedInput?.contributorFork !== true && Boolean(String(preparedInput?.createCommand || '').trim());
  if (preparedInput?.returnAfterDirectoryCreated === true && preparedInput?.contributorFork !== true && !usesCreateCommand) {
    await fsp.mkdir(candidate.directory, { recursive: false });

    let bootstrapStatus;
    try {
      bootstrapStatus = await setWorktreeBootstrapState(
        candidate.directory,
        WORKTREE_BOOTSTRAP_PENDING,
        WORKTREE_BOOTSTRAP_PHASE_DIRECTORY_CREATED,
        null,
        undefined,
        undefined,
        serverOptions.bootstrapStore,
      );
    } catch (error) {
      if (!isBootstrapPersistenceFailure(error)) throw error;
      bootstrapStatus = error.bootstrapStatus;
    }
    const localBranch = mode === 'existing'
      ? cleanBranchName(String(preparedInput?.branchName || preparedInput?.existingBranch || candidate.branch || '').trim())
      : candidate.branch;

    if (bootstrapStatus === null) throw new TypeError('Missing worktree bootstrap state');
    const task = bootstrapStatus.status === WORKTREE_BOOTSTRAP_PENDING
      ? attachGitWorktreeToCandidate(context, candidate, preparedInput, attachOptions).catch(async (error) => {
      const failureCode = bootstrapFailureCode(
        error,
        isFilenameTooLongError(error instanceof Error ? error.message : error),
      );
      await setWorktreeBootstrapState(
        candidate.directory,
        WORKTREE_BOOTSTRAP_FAILED,
        WORKTREE_BOOTSTRAP_PHASE_DIRECTORY_CREATED,
        worktreeBootstrapFailureMessage(failureCode)
          ?? 'Worktree creation failed. Inspect the checkout and repair it before use.',
        undefined,
        failureCode,
        serverOptions.bootstrapStore,
      ).catch(() => {});
      await cleanupFailedFastWorktreeCreate(context, candidate, serverOptions.bootstrapStore);
      console.warn('Background worktree creation failed:', error instanceof Error ? error.message : String(error));
      })
      : null;
    if (task) trackWorktreeBootstrapTask(candidate.directory, task);

    const result: WorktreeCreateResult = {
      head: '',
      name: candidate.name,
      branch: localBranch,
      path: candidate.directory,
      directoryCreated: true,
      bootstrapStatus,
    };
    if (prepared.sourceFetchFailed) {
      result.sourceFetchFailed = true;
      if (prepared.sourceFetchReason) result.sourceFetchReason = prepared.sourceFetchReason;
    }
    return withBranchBackup(result);
  }

  const result = withBranchBackup(await attachGitWorktreeToCandidate(context, candidate, preparedInput, attachOptions));
  if (!prepared.sourceFetchFailed) return result;
  return prepared.sourceFetchReason
    ? { ...result, sourceFetchFailed: true, sourceFetchReason: prepared.sourceFetchReason }
    : { ...result, sourceFetchFailed: true };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// The code a failed bootstrap is recorded with, which decides what the user is
// told. A known cause is never recorded as unknown: a repository grant whose
// account needs attention reads as the access problem it is.
const bootstrapFailureCode = (error, pathLengthFailure) => {
 if (error?.hydration) return error.code;
 if (pathLengthFailure) return 'PATH_LENGTH_LIMIT';
 if (error?.reason === 'needs-attention' || error?.code === 'AUTHENTICATION_REQUIRED') return 'AUTHENTICATION_REQUIRED';
 return 'UNKNOWN';
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// The code a failed bootstrap is recorded with, which decides what the user is
// told. A known cause is never recorded as unknown: a repository grant whose
// account needs attention reads as the access problem it is.
const bootstrapFailureCode = (error, pathLengthFailure) => {
  if (error?.hydration) return error.code;
  if (pathLengthFailure) return 'PATH_LENGTH_LIMIT';
  if (error?.reason === 'needs-attention' || error?.code === 'AUTHENTICATION_REQUIRED') return 'AUTHENTICATION_REQUIRED';
  return 'UNKNOWN';
=======
const bootstrapFailureCode = <Failure>(error: Failure, pathLengthFailure: boolean) => {
  if (hasErrorFields(error) && error.hydration) return error.code;
  if (pathLengthFailure) return 'PATH_LENGTH_LIMIT';
  if (errorField(error, 'reason') === 'needs-attention' || errorField(error, 'code') === 'AUTHENTICATION_REQUIRED') return 'AUTHENTICATION_REQUIRED';
  if (errorField(error, 'code') === 'BRANCH_NAME_CONFLICT') return 'BRANCH_NAME_CONFLICT';
  return 'UNKNOWN';
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const inspectWorktreeBootstrapRecovery = async (directory) => {
 const attached = await runGitCommand(directory, ['rev-parse', '--is-inside-work-tree']);
 if (!attached.success || String(attached.stdout || '').trim() !== 'true') {
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const inspectWorktreeBootstrapRecovery = async (directory) => {
  const attached = await runGitCommand(directory, ['rev-parse', '--is-inside-work-tree']);
  if (!attached.success || String(attached.stdout || '').trim() !== 'true') {
    return createWorktreeBootstrapState(
      WORKTREE_BOOTSTRAP_FAILED,
      WORKTREE_BOOTSTRAP_PHASE_DIRECTORY_CREATED,
      WORKTREE_BOOTSTRAP_RECOVERY_ERROR,
      undefined,
      'UNKNOWN',
    );
  }
  const head = await runGitCommand(directory, ['rev-parse', '--verify', 'HEAD']);
  const indexMatchesHead = await runGitCommand(directory, ['diff', '--cached', '--quiet', 'HEAD', '--']);
  const deleted = await runGitCommand(directory, ['ls-files', '--deleted', '-z']);
  const checkoutPopulated = head.success && String(head.stdout || '').trim()
    && indexMatchesHead.success && deleted.success && !String(deleted.stdout || '');
=======
const inspectWorktreeBootstrapRecovery = async (directory: string) => {
  const attached = await runGitCommand(directory, ['rev-parse', '--is-inside-work-tree']);
  if (!attached.success || String(attached.stdout || '').trim() !== 'true') {
    return createWorktreeBootstrapState(
      WORKTREE_BOOTSTRAP_FAILED,
      WORKTREE_BOOTSTRAP_PHASE_DIRECTORY_CREATED,
      WORKTREE_BOOTSTRAP_RECOVERY_ERROR,
      undefined,
      'UNKNOWN',
    );
  }
  const head = await runGitCommand(directory, ['rev-parse', '--verify', 'HEAD']);
  const indexMatchesHead = await runGitCommand(directory, ['diff', '--cached', '--quiet', 'HEAD', '--']);
  const deleted = await runGitCommand(directory, ['ls-files', '--deleted', '-z']);
  const checkoutPopulated = head.success && String(head.stdout || '').trim()
    && indexMatchesHead.success && deleted.success && !String(deleted.stdout || '');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  return createWorktreeBootstrapState(
   WORKTREE_BOOTSTRAP_FAILED,
   WORKTREE_BOOTSTRAP_PHASE_DIRECTORY_CREATED,
   WORKTREE_BOOTSTRAP_RECOVERY_ERROR,
   undefined,
   'UNKNOWN',
  );
 }
 const head = await runGitCommand(directory, ['rev-parse', '--verify', 'HEAD']);
 const indexMatchesHead = await runGitCommand(directory, ['diff', '--cached', '--quiet', 'HEAD', '--']);
 const deleted = await runGitCommand(directory, ['ls-files', '--deleted', '-z']);
 const checkoutPopulated = head.success && String(head.stdout || '').trim()
  && indexMatchesHead.success && deleted.success && !String(deleted.stdout || '');
 return createWorktreeBootstrapState(
  WORKTREE_BOOTSTRAP_FAILED,
  checkoutPopulated ? WORKTREE_BOOTSTRAP_PHASE_GIT_READY : WORKTREE_BOOTSTRAP_PHASE_DIRECTORY_CREATED,
  WORKTREE_BOOTSTRAP_RECOVERY_ERROR,
  undefined,
  'UNKNOWN',
 );
};

const notBootstrappedHere = () => createWorktreeBootstrapState(
 WORKTREE_BOOTSTRAP_READY,
 WORKTREE_BOOTSTRAP_PHASE_SETUP_READY,
);

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// A persisted record becomes this process's state. One left `pending` with no
// live bootstrap behind it is a crash mid-population and is inspected.
const adoptPersistedBootstrapState = async (key, persisted, bootstrapStore) => {
 if (persisted.status !== WORKTREE_BOOTSTRAP_PENDING || await hasActiveWorktreeBootstrap(key)) {
  worktreeBootstrapState.set(key, persisted);
  return persisted;
 }
 const blocker = await inspectWorktreeBootstrapRecovery(key);
 worktreeBootstrapState.set(key, blocker);
 await bootstrapStore.write(key, blocker);
 return blocker;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// A persisted record becomes this process's state. One left `pending` with no
// live bootstrap behind it is a crash mid-population and is inspected.
const adoptPersistedBootstrapState = async (key, persisted, bootstrapStore) => {
  if (persisted.status !== WORKTREE_BOOTSTRAP_PENDING || await hasActiveWorktreeBootstrap(key)) {
    worktreeBootstrapState.set(key, persisted);
    return persisted;
  }
  const blocker = await inspectWorktreeBootstrapRecovery(key);
  worktreeBootstrapState.set(key, blocker);
  await bootstrapStore.write(key, blocker);
  return blocker;
=======
const adoptPersistedBootstrapState = async (key: string, persisted: WorktreeBootstrapState, bootstrapStore: BootstrapStore) => {
  const current = worktreeBootstrapState.get(key);
  if (persisted.status === WORKTREE_BOOTSTRAP_FAILED && isRolledBackAttemptFailure(current)) {
    return current ?? persisted;
  }
  if (persisted.status !== WORKTREE_BOOTSTRAP_PENDING || await hasActiveWorktreeBootstrap(key)) {
    worktreeBootstrapState.set(key, persisted);
    if (persisted.status === WORKTREE_BOOTSTRAP_FAILED && !await hasActiveWorktreeBootstrap(key)
      && await forgetMissingWorktreeFailure(key, bootstrapStore)) {
      return worktreeBootstrapState.get(key) ?? notBootstrappedHere();
    }
    return persisted;
  }
  const blocker = await inspectWorktreeBootstrapRecovery(key);
  worktreeBootstrapState.set(key, blocker);
  await bootstrapStore.write(key, blocker);
  return blocker;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function getWorktreeBootstrapStatus(directory, { bootstrapStore } = {}) {
 const key = await toCanonicalBootstrapStateKey(directory);
 if (!key) {
  throw new Error('Worktree directory is required');
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function getWorktreeBootstrapStatus(directory, { bootstrapStore } = {}) {
  const key = await toCanonicalBootstrapStateKey(directory);
  if (!key) {
    throw new Error('Worktree directory is required');
  }
=======
export async function getWorktreeBootstrapStatus(directory: string, { bootstrapStore }: BootstrapOptions = {}) {
  const key = await toCanonicalBootstrapStateKey(directory);
  if (!key) {
    throw new Error('Worktree directory is required');
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 if (bootstrapStore) {
  try {
   const persisted = await bootstrapStore.read(key);
   if (!persisted) {
    return worktreeBootstrapState.get(key) ?? notBootstrappedHere();
   }
   return await adoptPersistedBootstrapState(key, persisted, bootstrapStore);
  } catch {
   const blocker = await inspectWorktreeBootstrapRecovery(key);
   worktreeBootstrapState.set(key, blocker);
   return blocker;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  if (bootstrapStore) {
    try {
      const persisted = await bootstrapStore.read(key);
      if (!persisted) {
        return worktreeBootstrapState.get(key) ?? notBootstrappedHere();
      }
      return await adoptPersistedBootstrapState(key, persisted, bootstrapStore);
    } catch {
      const blocker = await inspectWorktreeBootstrapRecovery(key);
      worktreeBootstrapState.set(key, blocker);
      return blocker;
    }
=======
  if (bootstrapStore) {
    try {
      const persisted = await bootstrapStore.read(key);
      if (!persisted) {
        if (isReclaimableFailure(worktreeBootstrapState.get(key)) && !await hasActiveWorktreeBootstrap(key)) {
          await forgetMissingWorktreeFailure(key, bootstrapStore);
        }
        return worktreeBootstrapState.get(key) ?? notBootstrappedHere();
      }
      return await adoptPersistedBootstrapState(key, persisted, bootstrapStore);
    } catch {
      const current = worktreeBootstrapState.get(key);
      if (current && isRolledBackAttemptFailure(current)) return current;
      const blocker = await inspectWorktreeBootstrapRecovery(key);
      worktreeBootstrapState.set(key, blocker);
      return blocker;
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
 }
 return worktreeBootstrapState.get(key) ?? notBootstrappedHere();
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  return worktreeBootstrapState.get(key) ?? notBootstrappedHere();
=======
  if (isReclaimableFailure(worktreeBootstrapState.get(key)) && !await hasActiveWorktreeBootstrap(key)) {
    await forgetMissingWorktreeFailure(key);
  }
  return worktreeBootstrapState.get(key) ?? notBootstrappedHere();
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

const worktreeBootstrapGateLoads = new Map<string, Promise<void>>();

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * The state the OpenCode proxy's checkout gate reads on every request. It
 * reads memory, since the store takes a cross-process file lock per read. The
 * first read of a folder in this process loads its persisted record, so a
 * checkout that failed before a restart stays closed from the first request
 * instead of only after something reads its status with the store. A store
 * that cannot be read leaves the folder to memory, as before the load, and is
 * not read again for it: failing closed there would close every folder.
 */
export async function getWorktreeBootstrapGateStatus(directory, { bootstrapStore } = {}) {
 const key = await toCanonicalBootstrapStateKey(directory);
 if (!key) {
  throw new Error('Worktree directory is required');
 }
 if (bootstrapStore && !worktreeBootstrapState.has(key)) {
  let load = worktreeBootstrapGateLoads.get(key);
  if (!load) {
   load = (async () => {
    try {
     const persisted = await bootstrapStore.read(key);
     // A bootstrap that began meanwhile is newer than the file.
     if (persisted && !worktreeBootstrapState.has(key)) {
      await adoptPersistedBootstrapState(key, persisted, bootstrapStore);
     }
    } catch (error) {
     console.warn(`[git] Could not read the saved setup state of ${key}:`, error?.message ?? error);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * The state the OpenCode proxy's checkout gate reads on every request. It
 * reads memory, since the store takes a cross-process file lock per read. The
 * first read of a folder in this process loads its persisted record, so a
 * checkout that failed before a restart stays closed from the first request
 * instead of only after something reads its status with the store. A store
 * that cannot be read leaves the folder to memory, as before the load, and is
 * not read again for it: failing closed there would close every folder.
 */
export async function getWorktreeBootstrapGateStatus(directory, { bootstrapStore } = {}) {
  const key = await toCanonicalBootstrapStateKey(directory);
  if (!key) {
    throw new Error('Worktree directory is required');
  }
  if (bootstrapStore && !worktreeBootstrapState.has(key)) {
    let load = worktreeBootstrapGateLoads.get(key);
    if (!load) {
      load = (async () => {
        try {
          const persisted = await bootstrapStore.read(key);
          // A bootstrap that began meanwhile is newer than the file.
          if (persisted && !worktreeBootstrapState.has(key)) {
            await adoptPersistedBootstrapState(key, persisted, bootstrapStore);
          }
        } catch (error) {
          console.warn(`[git] Could not read the saved setup state of ${key}:`, error?.message ?? error);
        }
      })();
      worktreeBootstrapGateLoads.set(key, load);
=======
export async function getWorktreeBootstrapGateStatus(directory: string, { bootstrapStore }: BootstrapOptions = {}) {
  const key = await toCanonicalBootstrapStateKey(directory);
  if (!key) {
    throw new Error('Worktree directory is required');
  }
  if (bootstrapStore && !worktreeBootstrapState.has(key)) {
    let load = worktreeBootstrapGateLoads.get(key);
    if (!load) {
      load = (async () => {
        try {
          const persisted = await bootstrapStore.read(key);
          if (persisted && !worktreeBootstrapState.has(key)) {
            await adoptPersistedBootstrapState(key, persisted, bootstrapStore);
          }
        } catch (error) {
          console.warn(`[git] Could not read the saved setup state of ${key}:`, errorField(error, 'message') ?? error);
        }
      })();
      worktreeBootstrapGateLoads.set(key, load);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    }
   })();
   worktreeBootstrapGateLoads.set(key, load);
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
  await load;
 }
 return worktreeBootstrapState.get(key) ?? notBootstrappedHere();
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  return worktreeBootstrapState.get(key) ?? notBootstrappedHere();
=======
  const current = worktreeBootstrapState.get(key);
  if (isReclaimableFailure(current) && !await hasActiveWorktreeBootstrap(key)
    && await directoryIsGone(key)) {
    try {
      await forgetMissingWorktreeFailure(key, bootstrapStore);
    } catch {
      void 0;
    }
    return worktreeBootstrapState.get(key) ?? notBootstrappedHere();
  }
  return current ?? notBootstrappedHere();
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Marks a failed checkout ready once a repair hydrated it. While the record
 * still says failed, the OpenCode proxy keeps the folder closed, so whatever
 * OpenCode holds for it is dropped first (`disposeInstance`, best-effort) and
 * the first request after the repair opens the folder complete.
 */
export async function completeWorktreeCheckoutHydration(directory, { bootstrapStore, disposeInstance } = {}) {
 const key = await toCanonicalBootstrapStateKey(directory);
 if (!key) throw new Error('Worktree directory is required');
 const recorded = bootstrapStore ? await bootstrapStore.read(key) : worktreeBootstrapState.get(key);
 if (recorded?.status === WORKTREE_BOOTSTRAP_FAILED && recorded.hydration) {
  await disposeWorktreeInstanceBestEffort(disposeInstance, directory);
 }
 if (bootstrapStore) {
  const completed = await bootstrapStore.completeHydration(key);
  if (completed) worktreeBootstrapState.set(key, completed);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Marks a failed checkout ready once a repair hydrated it. While the record
 * still says failed, the OpenCode proxy keeps the folder closed, so whatever
 * OpenCode holds for it is dropped first (`disposeInstance`, best-effort) and
 * the first request after the repair opens the folder complete.
 */
export async function completeWorktreeCheckoutHydration(directory, { bootstrapStore, disposeInstance } = {}) {
  const key = await toCanonicalBootstrapStateKey(directory);
  if (!key) throw new Error('Worktree directory is required');
  const recorded = bootstrapStore ? await bootstrapStore.read(key) : worktreeBootstrapState.get(key);
  if (recorded?.status === WORKTREE_BOOTSTRAP_FAILED && recorded.hydration) {
    await disposeWorktreeInstanceBestEffort(disposeInstance, directory);
  }
  if (bootstrapStore) {
    const completed = await bootstrapStore.completeHydration(key);
    if (completed) worktreeBootstrapState.set(key, completed);
    return completed;
  }
  const current = worktreeBootstrapState.get(key);
  if (current?.status !== WORKTREE_BOOTSTRAP_FAILED || !current.hydration
    || ['succeeded', 'not-needed'].includes(current.hydration.status)) return null;
  const completed = createWorktreeBootstrapState(
    WORKTREE_BOOTSTRAP_READY,
    WORKTREE_BOOTSTRAP_PHASE_SETUP_READY,
  );
  worktreeBootstrapState.set(key, completed);
=======
export async function completeWorktreeCheckoutHydration(directory: string, { bootstrapStore, disposeInstance }: BootstrapOptions & Pick<WorktreeRemovalInput, 'disposeInstance'> = {}) {
  const key = await toCanonicalBootstrapStateKey(directory);
  if (!key) throw new Error('Worktree directory is required');
  const recorded = bootstrapStore ? await bootstrapStore.read(key) : worktreeBootstrapState.get(key);
  if (recorded?.status === WORKTREE_BOOTSTRAP_FAILED && recorded.hydration) {
    await disposeWorktreeInstanceBestEffort(disposeInstance, directory);
  }
  if (bootstrapStore) {
    const completed = await bootstrapStore.completeHydration(key);
    if (completed) worktreeBootstrapState.set(key, completed);
    return completed;
  }
  const current = worktreeBootstrapState.get(key);
  if (current?.status !== WORKTREE_BOOTSTRAP_FAILED || !current.hydration
    || ['succeeded', 'not-needed'].some((status) => status === errorField(current.hydration, 'status'))) return null;
  const completed = createWorktreeBootstrapState(
    WORKTREE_BOOTSTRAP_READY,
    WORKTREE_BOOTSTRAP_PHASE_SETUP_READY,
  );
  worktreeBootstrapState.set(key, completed);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  return completed;
 }
 const current = worktreeBootstrapState.get(key);
 if (current?.status !== WORKTREE_BOOTSTRAP_FAILED || !current.hydration
  || ['succeeded', 'not-needed'].includes(current.hydration.status)) return null;
 const completed = createWorktreeBootstrapState(
  WORKTREE_BOOTSTRAP_READY,
  WORKTREE_BOOTSTRAP_PHASE_SETUP_READY,
 );
 worktreeBootstrapState.set(key, completed);
 return completed;
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Releases the OpenCode instance that served a removed or repaired worktree.
 * The owning runtime injects `disposeInstance`; disposal is best-effort, so a
 * failure is warned about and never fails or rolls back the caller's work.
 */
const disposeWorktreeInstanceBestEffort = async (disposeInstance, worktreeDirectory) => {
 if (!disposeInstance) {
  return;
 }
 try {
  await disposeInstance(worktreeDirectory);
 } catch (error) {
  console.warn(
   `Failed to dispose the OpenCode instance for worktree ${worktreeDirectory}:`,
   error instanceof Error ? error.message : String(error)
  );
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Releases the OpenCode instance that served a removed or repaired worktree.
 * The owning runtime injects `disposeInstance`; disposal is best-effort, so a
 * failure is warned about and never fails or rolls back the caller's work.
 */
const disposeWorktreeInstanceBestEffort = async (disposeInstance, worktreeDirectory) => {
  if (!disposeInstance) {
    return;
  }
  try {
    await disposeInstance(worktreeDirectory);
  } catch (error) {
    console.warn(
      `Failed to dispose the OpenCode instance for worktree ${worktreeDirectory}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
=======
const disposeWorktreeInstanceBestEffort = async (disposeInstance: WorktreeRemovalInput['disposeInstance'], worktreeDirectory: string) => {
  if (!disposeInstance) {
    return;
  }
  try {
    await disposeInstance(worktreeDirectory);
  } catch (error) {
    console.warn(
      `Failed to dispose the OpenCode instance for worktree ${worktreeDirectory}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

const worktreeRemovalsInProgress = new Set<{ root: string; settled: Promise<void> }>();

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// A requested folder need not exist; its nearest existing parent is resolved,
// so a worktree reached through a symlink (/var is /private/var on macOS)
// still matches.
const canonicalPathOfExistingAncestor = async (input) => {
 const absolutePath = path.resolve(input);
 for (let current = absolutePath; ; current = path.dirname(current)) {
  const realPath = await fsp.realpath(current).catch(() => null);
  if (realPath !== null || path.dirname(current) === current) {
   const normalized = path.normalize(path.join(realPath ?? current, path.relative(current, absolutePath)));
   return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// A requested folder need not exist; its nearest existing parent is resolved,
// so a worktree reached through a symlink (/var is /private/var on macOS)
// still matches.
const canonicalPathOfExistingAncestor = async (input) => {
  const absolutePath = path.resolve(input);
  for (let current = absolutePath; ; current = path.dirname(current)) {
    const realPath = await fsp.realpath(current).catch(() => null);
    if (realPath !== null || path.dirname(current) === current) {
      const normalized = path.normalize(path.join(realPath ?? current, path.relative(current, absolutePath)));
      return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    }
=======
const canonicalPathOfExistingAncestor = async (input: string) => {
  const absolutePath = path.resolve(input);
  for (let current = absolutePath; ; current = path.dirname(current)) {
    const realPath = await fsp.realpath(current).catch(() => null);
    if (realPath !== null || path.dirname(current) === current) {
      const normalized = path.normalize(path.join(realPath ?? current, path.relative(current, absolutePath)));
      return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 }
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const trackWorktreeRemoval = (canonicalDirectory) => {
 let settle;
 const removal = { root: canonicalDirectory, settled: new Promise((resolve) => { settle = resolve; }) };
 worktreeRemovalsInProgress.add(removal);
 return () => {
  worktreeRemovalsInProgress.delete(removal);
  settle();
 };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const trackWorktreeRemoval = (canonicalDirectory) => {
  let settle;
  const removal = { root: canonicalDirectory, settled: new Promise((resolve) => { settle = resolve; }) };
  worktreeRemovalsInProgress.add(removal);
  return () => {
    worktreeRemovalsInProgress.delete(removal);
    settle();
  };
=======
const trackWorktreeRemoval = (canonicalDirectory: string) => {
  let settle: (() => void) | undefined;
  const removal = { root: canonicalDirectory, settled: new Promise<void>((resolve) => { settle = resolve; }) };
  worktreeRemovalsInProgress.add(removal);
  return () => {
    worktreeRemovalsInProgress.delete(removal);
    settle?.();
  };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Resolves once no removal of a worktree holding `directory` is in progress;
 * at once when none is.
 */
export async function waitForWorktreeRemoval(directory) {
 if (worktreeRemovalsInProgress.size === 0) return;
 const key = toBootstrapStateKey(directory);
 if (!key) return;
 const target = await canonicalPathOfExistingAncestor(key);
 const pending = [...worktreeRemovalsInProgress]
  .filter((removal) => isInsideOrSameDirectory(removal.root, target))
  .map((removal) => removal.settled);
 await Promise.all(pending);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Resolves once no removal of a worktree holding `directory` is in progress;
 * at once when none is.
 */
export async function waitForWorktreeRemoval(directory) {
  if (worktreeRemovalsInProgress.size === 0) return;
  const key = toBootstrapStateKey(directory);
  if (!key) return;
  const target = await canonicalPathOfExistingAncestor(key);
  const pending = [...worktreeRemovalsInProgress]
    .filter((removal) => isInsideOrSameDirectory(removal.root, target))
    .map((removal) => removal.settled);
  await Promise.all(pending);
=======
export async function waitForWorktreeRemoval(directory: string) {
  if (worktreeRemovalsInProgress.size === 0) return;
  const key = toBootstrapStateKey(directory);
  if (!key) return;
  const target = await canonicalPathOfExistingAncestor(key);
  const pending = [...worktreeRemovalsInProgress]
    .filter((removal) => isInsideOrSameDirectory(removal.root, target))
    .map((removal) => removal.settled);
  await Promise.all(pending);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

const WORKTREE_BUSY_RETRY_DELAYS_MS = [250, 500, 1000, 2000];
const WORKTREE_BUSY_MESSAGE = 'The worktree folder is still in use by another process (a running session, terminal or editor). Stop it and try again.';

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Only Windows locks a folder that is open elsewhere; on other platforms the
// same words mean a real permission problem and are reported as they are.
const isWorktreeBusyError = (text) => process.platform === 'win32'
 && /Permission denied|EBUSY|EPERM|resource busy|being used by another process/i.test(String(text || ''));
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Only Windows locks a folder that is open elsewhere; on other platforms the
// same words mean a real permission problem and are reported as they are.
const isWorktreeBusyError = (text) => process.platform === 'win32'
  && /Permission denied|EBUSY|EPERM|resource busy|being used by another process/i.test(String(text || ''));
=======
const isWorktreeBusyError = <Text>(text: Text) => process.platform === 'win32'
  && /Permission denied|EBUSY|EPERM|resource busy|being used by another process/i.test(String(text || ''));
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const removeBusyDirectory = async (targetDirectory) => {
 try {
  // fs.rm retries EBUSY/EPERM itself with these options.
  await fsp.rm(targetDirectory, { recursive: true, force: true, maxRetries: WORKTREE_BUSY_RETRY_DELAYS_MS.length, retryDelay: WORKTREE_BUSY_RETRY_DELAYS_MS[0] });
 } catch (error) {
  if (isWorktreeBusyError(error?.code) || isWorktreeBusyError(error?.message)) {
   throw new Error(WORKTREE_BUSY_MESSAGE);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const removeBusyDirectory = async (targetDirectory) => {
  try {
    // fs.rm retries EBUSY/EPERM itself with these options.
    await fsp.rm(targetDirectory, { recursive: true, force: true, maxRetries: WORKTREE_BUSY_RETRY_DELAYS_MS.length, retryDelay: WORKTREE_BUSY_RETRY_DELAYS_MS[0] });
  } catch (error) {
    if (isWorktreeBusyError(error?.code) || isWorktreeBusyError(error?.message)) {
      throw new Error(WORKTREE_BUSY_MESSAGE);
    }
    throw error;
=======
const removeBusyDirectory = async (targetDirectory: string) => {
  try {
    await fsp.rm(targetDirectory, { recursive: true, force: true, maxRetries: WORKTREE_BUSY_RETRY_DELAYS_MS.length, retryDelay: WORKTREE_BUSY_RETRY_DELAYS_MS[0] });
  } catch (error) {
    if (isWorktreeBusyError(errorField(error, 'code')) || isWorktreeBusyError(errorField(error, 'message'))) {
      throw new Error(WORKTREE_BUSY_MESSAGE);
    }
    throw error;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  throw error;
 }
};

const isSameFilesystemEntry = (current: fs.Stats | null, original: fs.Stats) => current?.dev === original.dev && current?.ino === original.ino;

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Git removal requires a gitdir file even when Git accepts a directory symlink
// for ordinary worktree operations. Only a registered linked worktree calls here.
const replaceWorktreeGitDirectoryLink = async (primaryWorktree, worktreePath) => {
 const gitEntry = path.join(worktreePath, '.git');
 const linkStat = await fsp.lstat(gitEntry).catch((error) => {
  if (error?.code === 'ENOENT') return null;
  throw error;
 });
 if (!linkStat?.isSymbolicLink() || !(await fsp.stat(gitEntry)).isDirectory()) return null;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Git removal requires a gitdir file even when Git accepts a directory symlink
// for ordinary worktree operations. Only a registered linked worktree calls here.
const replaceWorktreeGitDirectoryLink = async (primaryWorktree, worktreePath) => {
  const gitEntry = path.join(worktreePath, '.git');
  const linkStat = await fsp.lstat(gitEntry).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (!linkStat?.isSymbolicLink() || !(await fsp.stat(gitEntry)).isDirectory()) return null;
=======
const replaceWorktreeGitDirectoryLink = async (primaryWorktree: string, worktreePath: string) => {
  const gitEntry = path.join(worktreePath, '.git');
  const linkStat = await fsp.lstat(gitEntry).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (!linkStat?.isSymbolicLink() || !(await fsp.stat(gitEntry)).isDirectory()) return null;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const linkTarget = await fsp.readlink(gitEntry, { encoding: 'buffer' });
 const metadataDirectory = await fsp.realpath(gitEntry);
 const commonResult = await runGitCommandOrThrow(primaryWorktree, ['rev-parse', '--git-common-dir']);
 const commonDirectory = await canonicalPath(path.resolve(primaryWorktree, commonResult.stdout.trim()));
 const metadataRoot = await canonicalPath(path.join(commonDirectory, 'worktrees'));
 if (await canonicalPath(path.dirname(metadataDirectory)) !== metadataRoot) {
  throw new Error('Worktree .git symlink target is outside this repository\'s worktree metadata');
 }

 const commonDir = (await fsp.readFile(path.join(metadataDirectory, 'commondir'), 'utf8')).trim();
 if (!commonDir || await canonicalPath(path.resolve(metadataDirectory, commonDir)) !== commonDirectory) {
  throw new Error('Worktree .git symlink metadata has a different common directory');
 }

 const backlink = (await fsp.readFile(path.join(metadataDirectory, 'gitdir'), 'utf8')).trim();
 const backlinkPath = path.resolve(metadataDirectory, backlink);
 // Compare the .git entry, not its symlink target: another worktree can point
 // at the same metadata directory without owning it.
 if (!backlink || path.basename(backlinkPath) !== '.git'
  || await canonicalPath(path.dirname(backlinkPath)) !== await canonicalPath(worktreePath)) {
  throw new Error('Worktree .git symlink metadata backlink does not name this worktree');
 }

 const worktreeStat = await fsp.stat(worktreePath);
 const metadataStat = await fsp.stat(metadataDirectory);
 const sameDirectoriesExist = async () => {
  const [currentWorktree, currentMetadata] = await Promise.all([
   fsp.stat(worktreePath).catch(() => null),
   fsp.stat(metadataDirectory).catch(() => null),
  ]);
  return currentWorktree?.isDirectory() && isSameFilesystemEntry(currentWorktree, worktreeStat)
   && currentMetadata?.isDirectory() && isSameFilesystemEntry(currentMetadata, metadataStat);
 };
 const restoreClaimedEntry = async (claimedEntry) => {
  const claimedStat = await fsp.lstat(claimedEntry);
  if (claimedStat.isSymbolicLink()) {
   // Hardlink creation can follow symlinks; preserve their target bytes.
   const claimedTarget = await fsp.readlink(claimedEntry, { encoding: 'buffer' });
   await fsp.symlink(claimedTarget, gitEntry);
   const currentLink = await fsp.lstat(claimedEntry).catch(() => null);
   return currentLink?.isSymbolicLink() && isSameFilesystemEntry(currentLink, claimedStat)
    && (await fsp.readlink(claimedEntry, { encoding: 'buffer' })).equals(claimedTarget);
  }
  if (claimedStat.isFile()) {
   await fsp.link(claimedEntry, gitEntry);
   return true;
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
  return false;
 };
 const contents = `gitdir: ${process.platform === 'win32' ? toGitPath(metadataDirectory) : metadataDirectory}\n`;
 const temporaryEntry = `${gitEntry}.openchamber-${randomUUID()}`;
 const claimedLinkEntry = `${gitEntry}.openchamber-${randomUUID()}`;
 let temporaryIdentity;
 let claimedLink = false;
 let releaseLinkClaim = false;
 try {
  await fsp.writeFile(temporaryEntry, contents, { flag: 'wx', mode: 0o600 });
  temporaryIdentity = await getFileIdentity(temporaryEntry);
  const currentLink = await fsp.lstat(gitEntry);
  if (!currentLink.isSymbolicLink() || !isSameFilesystemEntry(currentLink, linkStat)
   || !(await fsp.readlink(gitEntry, { encoding: 'buffer' })).equals(linkTarget)) {
   throw new Error('Worktree .git entry changed before removal');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js

  const backlink = (await fsp.readFile(path.join(metadataDirectory, 'gitdir'), 'utf8')).trim();
  const backlinkPath = path.resolve(metadataDirectory, backlink);
  // Compare the .git entry, not its symlink target: another worktree can point
  // at the same metadata directory without owning it.
  if (!backlink || path.basename(backlinkPath) !== '.git'
    || await canonicalPath(path.dirname(backlinkPath)) !== await canonicalPath(worktreePath)) {
    throw new Error('Worktree .git symlink metadata backlink does not name this worktree');
=======

  const backlink = (await fsp.readFile(path.join(metadataDirectory, 'gitdir'), 'utf8')).trim();
  const backlinkPath = path.resolve(metadataDirectory, backlink);
  if (!backlink || path.basename(backlinkPath) !== '.git'
    || await canonicalPath(path.dirname(backlinkPath)) !== await canonicalPath(worktreePath)) {
    throw new Error('Worktree .git symlink metadata backlink does not name this worktree');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
  await fsp.rename(gitEntry, claimedLinkEntry);
  claimedLink = true;
  const capturedLink = await fsp.lstat(claimedLinkEntry);
  if (!capturedLink.isSymbolicLink() || !isSameFilesystemEntry(capturedLink, linkStat)
   || !(await fsp.readlink(claimedLinkEntry, { encoding: 'buffer' })).equals(linkTarget)
   || !await sameDirectoriesExist()) {
   throw new Error('Worktree .git entry changed before removal');
  }
  // The complete gitdir file appears only if no newer .git entry exists.
  await fsp.link(temporaryEntry, gitEntry);
  releaseLinkClaim = true;
 } catch (error) {
  if (claimedLink && await sameDirectoriesExist()) {
   try {
    releaseLinkClaim = await restoreClaimedEntry(claimedLinkEntry);
   } catch (restoreError) {
    if (restoreError?.code !== 'EEXIST') {
     console.warn('Failed to restore claimed worktree .git entry before removal:', restoreError);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js

  const worktreeStat = await fsp.stat(worktreePath);
  const metadataStat = await fsp.stat(metadataDirectory);
  const sameDirectoriesExist = async () => {
    const [currentWorktree, currentMetadata] = await Promise.all([
      fsp.stat(worktreePath).catch(() => null),
      fsp.stat(metadataDirectory).catch(() => null),
    ]);
    return currentWorktree?.isDirectory() && isSameFilesystemEntry(currentWorktree, worktreeStat)
      && currentMetadata?.isDirectory() && isSameFilesystemEntry(currentMetadata, metadataStat);
  };
  const restoreClaimedEntry = async (claimedEntry) => {
    const claimedStat = await fsp.lstat(claimedEntry);
    if (claimedStat.isSymbolicLink()) {
      // Hardlink creation can follow symlinks; preserve their target bytes.
      const claimedTarget = await fsp.readlink(claimedEntry, { encoding: 'buffer' });
      await fsp.symlink(claimedTarget, gitEntry);
      const currentLink = await fsp.lstat(claimedEntry).catch(() => null);
      return currentLink?.isSymbolicLink() && isSameFilesystemEntry(currentLink, claimedStat)
        && (await fsp.readlink(claimedEntry, { encoding: 'buffer' })).equals(claimedTarget);
=======

  const worktreeStat = await fsp.stat(worktreePath);
  const metadataStat = await fsp.stat(metadataDirectory);
  const sameDirectoriesExist = async () => {
    const [currentWorktree, currentMetadata] = await Promise.all([
      fsp.stat(worktreePath).catch(() => null),
      fsp.stat(metadataDirectory).catch(() => null),
    ]);
    return currentWorktree?.isDirectory() && isSameFilesystemEntry(currentWorktree, worktreeStat)
      && currentMetadata?.isDirectory() && isSameFilesystemEntry(currentMetadata, metadataStat);
  };
  const restoreClaimedEntry = async (claimedEntry: string) => {
    const claimedStat = await fsp.lstat(claimedEntry);
    if (claimedStat.isSymbolicLink()) {
      const claimedTarget = await fsp.readlink(claimedEntry, { encoding: 'buffer' });
      await fsp.symlink(claimedTarget, gitEntry);
      const currentLink = await fsp.lstat(claimedEntry).catch(() => null);
      return currentLink?.isSymbolicLink() && isSameFilesystemEntry(currentLink, claimedStat)
        && (await fsp.readlink(claimedEntry, { encoding: 'buffer' })).equals(claimedTarget);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
   }
  }
  throw error;
 } finally {
  if (claimedLink) {
   if (releaseLinkClaim) {
    await fsp.unlink(claimedLinkEntry).catch((error) => {
     if (error?.code !== 'ENOENT') {
      console.warn(`Failed to clean up worktree .git recovery entry: ${claimedLinkEntry}`, error);
     }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    if (claimedStat.isFile()) {
      await fsp.link(claimedEntry, gitEntry);
      return true;
    }
    return false;
  };
  const contents = `gitdir: ${process.platform === 'win32' ? toGitPath(metadataDirectory) : metadataDirectory}\n`;
  const temporaryEntry = `${gitEntry}.openchamber-${randomUUID()}`;
  const claimedLinkEntry = `${gitEntry}.openchamber-${randomUUID()}`;
  let temporaryIdentity;
  let claimedLink = false;
  let releaseLinkClaim = false;
  try {
    await fsp.writeFile(temporaryEntry, contents, { flag: 'wx', mode: 0o600 });
    temporaryIdentity = await getFileIdentity(temporaryEntry);
    const currentLink = await fsp.lstat(gitEntry);
    if (!currentLink.isSymbolicLink() || !isSameFilesystemEntry(currentLink, linkStat)
      || !(await fsp.readlink(gitEntry, { encoding: 'buffer' })).equals(linkTarget)) {
      throw new Error('Worktree .git entry changed before removal');
    }
    await fsp.rename(gitEntry, claimedLinkEntry);
    claimedLink = true;
    const capturedLink = await fsp.lstat(claimedLinkEntry);
    if (!capturedLink.isSymbolicLink() || !isSameFilesystemEntry(capturedLink, linkStat)
      || !(await fsp.readlink(claimedLinkEntry, { encoding: 'buffer' })).equals(linkTarget)
      || !await sameDirectoriesExist()) {
      throw new Error('Worktree .git entry changed before removal');
    }
    // The complete gitdir file appears only if no newer .git entry exists.
    await fsp.link(temporaryEntry, gitEntry);
    releaseLinkClaim = true;
  } catch (error) {
    if (claimedLink && await sameDirectoriesExist()) {
      try {
        releaseLinkClaim = await restoreClaimedEntry(claimedLinkEntry);
      } catch (restoreError) {
        if (restoreError?.code !== 'EEXIST') {
          console.warn('Failed to restore claimed worktree .git entry before removal:', restoreError);
        }
      }
    }
    throw error;
  } finally {
    if (claimedLink) {
      if (releaseLinkClaim) {
        await fsp.unlink(claimedLinkEntry).catch((error) => {
          if (error?.code !== 'ENOENT') {
            console.warn(`Failed to clean up worktree .git recovery entry: ${claimedLinkEntry}`, error);
          }
        });
      } else {
        console.warn(`Check worktree .git recovery entry: ${claimedLinkEntry}`);
      }
    }
    await fsp.rm(temporaryEntry, { force: true }).catch((error) => {
      console.warn('Failed to clean up temporary worktree gitdir file:', error);
=======
    if (claimedStat.isFile()) {
      await fsp.link(claimedEntry, gitEntry);
      return true;
    }
    return false;
  };
  const contents = `gitdir: ${process.platform === 'win32' ? toGitPath(metadataDirectory) : metadataDirectory}\n`;
  const temporaryEntry = `${gitEntry}.openchamber-${randomUUID()}`;
  const claimedLinkEntry = `${gitEntry}.openchamber-${randomUUID()}`;
  let temporaryIdentity;
  let claimedLink = false;
  let releaseLinkClaim: boolean | undefined = false;
  try {
    await fsp.writeFile(temporaryEntry, contents, { flag: 'wx', mode: 0o600 });
    temporaryIdentity = await getFileIdentity(temporaryEntry);
    const currentLink = await fsp.lstat(gitEntry);
    if (!currentLink.isSymbolicLink() || !isSameFilesystemEntry(currentLink, linkStat)
      || !(await fsp.readlink(gitEntry, { encoding: 'buffer' })).equals(linkTarget)) {
      throw new Error('Worktree .git entry changed before removal');
    }
    await fsp.rename(gitEntry, claimedLinkEntry);
    claimedLink = true;
    const capturedLink = await fsp.lstat(claimedLinkEntry);
    if (!capturedLink.isSymbolicLink() || !isSameFilesystemEntry(capturedLink, linkStat)
      || !(await fsp.readlink(claimedLinkEntry, { encoding: 'buffer' })).equals(linkTarget)
      || !await sameDirectoriesExist()) {
      throw new Error('Worktree .git entry changed before removal');
    }
    await fsp.link(temporaryEntry, gitEntry);
    releaseLinkClaim = true;
  } catch (error) {
    if (claimedLink && await sameDirectoriesExist()) {
      try {
        releaseLinkClaim = await restoreClaimedEntry(claimedLinkEntry);
      } catch (restoreError) {
        if (errorField(restoreError, 'code') !== 'EEXIST') {
          console.warn('Failed to restore claimed worktree .git entry before removal:', restoreError);
        }
      }
    }
    throw error;
  } finally {
    if (claimedLink) {
      if (releaseLinkClaim) {
        await fsp.unlink(claimedLinkEntry).catch((error) => {
          if (error?.code !== 'ENOENT') {
            console.warn(`Failed to clean up worktree .git recovery entry: ${claimedLinkEntry}`, error);
          }
        });
      } else {
        console.warn(`Check worktree .git recovery entry: ${claimedLinkEntry}`);
      }
    }
    await fsp.rm(temporaryEntry, { force: true }).catch((error) => {
      console.warn('Failed to clean up temporary worktree gitdir file:', error);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    });
   } else {
    console.warn(`Check worktree .git recovery entry: ${claimedLinkEntry}`);
   }
  }
  await fsp.rm(temporaryEntry, { force: true }).catch((error) => {
   console.warn('Failed to clean up temporary worktree gitdir file:', error);
  });
 }

 return async () => {
  const isTemporaryFile = async (entry) => {
   const stat = await fsp.lstat(entry).catch(() => null);
   return stat?.isFile() && await getFileIdentity(entry) === temporaryIdentity
    && await fsp.readFile(entry, 'utf8') === contents;
  };
  if (!await sameDirectoriesExist() || !await isTemporaryFile(gitEntry)) return;

  const claimedEntry = `${gitEntry}.openchamber-${randomUUID()}`;
  try {
   await fsp.rename(gitEntry, claimedEntry);
  } catch (error) {
   if (error?.code === 'ENOENT') return;
   throw error;
  }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  let releaseClaim = false;
  try {
   if (!await sameDirectoriesExist()) return;
   if (!await isTemporaryFile(claimedEntry)) {
    releaseClaim = await restoreClaimedEntry(claimedEntry);
    return;
   }
   try {
    await fsp.symlink(linkTarget, gitEntry, 'dir');
    releaseClaim = true;
   } catch (error) {
    if (error?.code === 'EEXIST') {
     releaseClaim = await isTemporaryFile(claimedEntry);
     return;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  return async () => {
    const isTemporaryFile = async (entry) => {
      const stat = await fsp.lstat(entry).catch(() => null);
      return stat?.isFile() && await getFileIdentity(entry) === temporaryIdentity
        && await fsp.readFile(entry, 'utf8') === contents;
    };
    if (!await sameDirectoriesExist() || !await isTemporaryFile(gitEntry)) return;

    const claimedEntry = `${gitEntry}.openchamber-${randomUUID()}`;
    try {
      await fsp.rename(gitEntry, claimedEntry);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
=======
  return async () => {
    const isTemporaryFile = async (entry: string) => {
      const stat = await fsp.lstat(entry).catch(() => null);
      return stat?.isFile() && await getFileIdentity(entry) === temporaryIdentity
        && await fsp.readFile(entry, 'utf8') === contents;
    };
    if (!await sameDirectoriesExist() || !await isTemporaryFile(gitEntry)) return;

    const claimedEntry = `${gitEntry}.openchamber-${randomUUID()}`;
    try {
      await fsp.rename(gitEntry, claimedEntry);
    } catch (error) {
      if (errorField(error, 'code') === 'ENOENT') return;
      throw error;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
    if (await sameDirectoriesExist()) {
     await fsp.link(claimedEntry, gitEntry);
     releaseClaim = true;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js

    let releaseClaim = false;
    try {
      if (!await sameDirectoriesExist()) return;
      if (!await isTemporaryFile(claimedEntry)) {
        releaseClaim = await restoreClaimedEntry(claimedEntry);
        return;
      }
      try {
        await fsp.symlink(linkTarget, gitEntry, 'dir');
        releaseClaim = true;
      } catch (error) {
        if (error?.code === 'EEXIST') {
          releaseClaim = await isTemporaryFile(claimedEntry);
          return;
        }
        if (await sameDirectoriesExist()) {
          await fsp.link(claimedEntry, gitEntry);
          releaseClaim = true;
        }
        throw error;
      }
    } finally {
      if (releaseClaim) {
        await fsp.unlink(claimedEntry);
      } else {
        console.warn(`Check worktree .git recovery entry: ${claimedEntry}`);
      }
=======

    let releaseClaim: boolean | undefined = false;
    try {
      if (!await sameDirectoriesExist()) return;
      if (!await isTemporaryFile(claimedEntry)) {
        releaseClaim = await restoreClaimedEntry(claimedEntry);
        return;
      }
      try {
        await fsp.symlink(linkTarget, gitEntry, 'dir');
        releaseClaim = true;
      } catch (error) {
        if (errorField(error, 'code') === 'EEXIST') {
          releaseClaim = await isTemporaryFile(claimedEntry);
          return;
        }
        if (await sameDirectoriesExist()) {
          await fsp.link(claimedEntry, gitEntry);
          releaseClaim = true;
        }
        throw error;
      }
    } finally {
      if (releaseClaim) {
        await fsp.unlink(claimedEntry);
      } else {
        console.warn(`Check worktree .git recovery entry: ${claimedEntry}`);
      }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    }
    throw error;
   }
  } finally {
   if (releaseClaim) {
    await fsp.unlink(claimedEntry);
   } else {
    console.warn(`Check worktree .git recovery entry: ${claimedEntry}`);
   }
  }
 };
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Resolves true when git removed the worktree, false when git dropped the
// registration but left the folder behind (the caller removes it as an orphan).
// Once git has started deleting it drops the registration, whatever stopped it:
// a busy folder, or a path longer than git can handle even with core.longpaths.
// A refusal before any deletion (a locked worktree) exits 128 like every git
// `die`, and leaves the folder untouched. A busy folder is released again
// before the next attempt, git's or the orphan removal's: a request that
// reached OpenCode after the first release has started the folder again.
const removeGitWorktreeWhenFree = async (primaryWorktree, worktreePath, targetCanonical, releaseInstance) => {
 for (let attempt = 0; ; attempt += 1) {
  const result = await runGitCommand(primaryWorktree, ['-c', 'core.longpaths=true', 'worktree', 'remove', '--force', worktreePath]);
  if (result.success) return true;
  const busy = isWorktreeBusyError(result.message);
  if (!busy && result.exitCode === 128) {
   throw new Error(result.message || 'Failed to remove git worktree');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Resolves true when git removed the worktree, false when git dropped the
// registration but left the folder behind (the caller removes it as an orphan).
// Once git has started deleting it drops the registration, whatever stopped it:
// a busy folder, or a path longer than git can handle even with core.longpaths.
// A refusal before any deletion (a locked worktree) exits 128 like every git
// `die`, and leaves the folder untouched. A busy folder is released again
// before the next attempt, git's or the orphan removal's: a request that
// reached OpenCode after the first release has started the folder again.
const removeGitWorktreeWhenFree = async (primaryWorktree, worktreePath, targetCanonical, releaseInstance) => {
  for (let attempt = 0; ; attempt += 1) {
    const result = await runGitCommand(primaryWorktree, ['-c', 'core.longpaths=true', 'worktree', 'remove', '--force', worktreePath]);
    if (result.success) return true;
    const busy = isWorktreeBusyError(result.message);
    if (!busy && result.exitCode === 128) {
      throw new Error(result.message || 'Failed to remove git worktree');
    }
    const stillRegistered = await (async () => {
      for (const entry of await listWorktreeEntries(primaryWorktree)) {
        if (entry?.worktree && await canonicalPath(entry.worktree) === targetCanonical) return true;
      }
      return false;
    })();
    if (!stillRegistered) {
      await releaseInstance();
      return false;
    }
    if (!busy) {
      throw new Error(result.message || 'Failed to remove git worktree');
    }
    const delay = WORKTREE_BUSY_RETRY_DELAYS_MS[attempt];
    if (delay === undefined) throw new Error(WORKTREE_BUSY_MESSAGE);
    await releaseInstance();
    await wait(delay);
=======
const removeGitWorktreeWhenFree = async (primaryWorktree: string, worktreePath: string, targetCanonical: string, releaseInstance: () => Promise<void>, overrideLock = false) => {
  const removeArgs = ['-c', 'core.longpaths=true', 'worktree', 'remove', '--force', ...(overrideLock ? ['--force'] : []), worktreePath];
  for (let attempt = 0; ; attempt += 1) {
    const result = await runGitCommand(primaryWorktree, removeArgs);
    if (result.success) return true;
    const busy = isWorktreeBusyError(result.message);
    if (!busy && result.exitCode === 128) {
      throw new Error(result.message || 'Failed to remove git worktree');
    }
    const stillRegistered = await (async () => {
      for (const entry of await listWorktreeEntries(primaryWorktree)) {
        if (entry?.worktree && await canonicalPath(entry.worktree) === targetCanonical) return true;
      }
      return false;
    })();
    if (!stillRegistered) {
      await releaseInstance();
      return false;
    }
    if (!busy) {
      throw new Error(result.message || 'Failed to remove git worktree');
    }
    const delay = WORKTREE_BUSY_RETRY_DELAYS_MS[attempt];
    if (delay === undefined) throw new Error(WORKTREE_BUSY_MESSAGE);
    await releaseInstance();
    await wait(delay);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  const stillRegistered = await (async () => {
   for (const entry of await listWorktreeEntries(primaryWorktree)) {
    if (entry?.worktree && await canonicalPath(entry.worktree) === targetCanonical) return true;
   }
   return false;
  })();
  if (!stillRegistered) {
   await releaseInstance();
   return false;
  }
  if (!busy) {
   throw new Error(result.message || 'Failed to remove git worktree');
  }
  const delay = WORKTREE_BUSY_RETRY_DELAYS_MS[attempt];
  if (delay === undefined) throw new Error(WORKTREE_BUSY_MESSAGE);
  await releaseInstance();
  await wait(delay);
 }
};

const WORKTREE_TEARDOWN_TIMEOUT_MS = 5 * 60 * 1000;
const WORKTREE_TEARDOWN_OUTPUT_MAX_CHARS = 2000;

const WORKTREE_TEARDOWN_FAILED = 'WORKTREE_TEARDOWN_FAILED';

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Teardown runs before anything is touched, while the worktree and its
// OpenCode instance are intact, so a failing command leaves both as they
// were. A folder already gone has nothing left to stop, and a checkout whose
// bootstrap failed never ran its setup commands. A contributor-fork checkout
// holds the contributor's code, and the server keeps no record of a checkout
// trust the user granted, so its teardown never runs; `isContributorCheckout`
// (injected by the route) answers that. When it cannot answer, nothing runs
// and the worktree is kept, with the teardown failure code, so the client can
// still offer to delete without teardown.
const runWorktreeTeardown = async (worktreeDirectory, command, isContributorCheckout) => {
 if (!String(command || '').trim()) return;
 if (!(await checkPathExists(worktreeDirectory))) return;
 const bootstrap = worktreeBootstrapState.get(await toCanonicalBootstrapStateKey(worktreeDirectory));
 if (bootstrap?.status === WORKTREE_BOOTSTRAP_FAILED) return;
 if (isContributorCheckout instanceof Function) {
  const contributor = await isContributorCheckout(worktreeDirectory).catch((error) => {
   throw Object.assign(new Error(`Could not tell whether this checkout holds a contributor's code, so no teardown command ran and the worktree was kept: ${error?.message || error}`), { code: WORKTREE_TEARDOWN_FAILED });
  });
  if (contributor) return;
 }
 const result = await runWorktreeStartCommand(worktreeDirectory, command, { timeoutMs: WORKTREE_TEARDOWN_TIMEOUT_MS });
 if (!result.success) {
  const output = result.message || 'the command exited with an error';
  const shown = output.length > WORKTREE_TEARDOWN_OUTPUT_MAX_CHARS ? `...${output.slice(-WORKTREE_TEARDOWN_OUTPUT_MAX_CHARS)}` : output;
  throw Object.assign(new Error(`Worktree teardown command failed, so the worktree was kept: ${shown}`), { code: WORKTREE_TEARDOWN_FAILED });
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Teardown runs before anything is touched, while the worktree and its
// OpenCode instance are intact, so a failing command leaves both as they
// were. A folder already gone has nothing left to stop, and a checkout whose
// bootstrap failed never ran its setup commands. A contributor-fork checkout
// holds the contributor's code, and the server keeps no record of a checkout
// trust the user granted, so its teardown never runs; `isContributorCheckout`
// (injected by the route) answers that. When it cannot answer, nothing runs
// and the worktree is kept, with the teardown failure code, so the client can
// still offer to delete without teardown.
const runWorktreeTeardown = async (worktreeDirectory, command, isContributorCheckout) => {
  if (!String(command || '').trim()) return;
  if (!(await checkPathExists(worktreeDirectory))) return;
  const bootstrap = worktreeBootstrapState.get(await toCanonicalBootstrapStateKey(worktreeDirectory));
  if (bootstrap?.status === WORKTREE_BOOTSTRAP_FAILED) return;
  if (isContributorCheckout instanceof Function) {
    const contributor = await isContributorCheckout(worktreeDirectory).catch((error) => {
      throw Object.assign(new Error(`Could not tell whether this checkout holds a contributor's code, so no teardown command ran and the worktree was kept: ${error?.message || error}`), { code: WORKTREE_TEARDOWN_FAILED });
    });
    if (contributor) return;
  }
  const result = await runWorktreeStartCommand(worktreeDirectory, command, { timeoutMs: WORKTREE_TEARDOWN_TIMEOUT_MS });
  if (!result.success) {
    const output = result.message || 'the command exited with an error';
    const shown = output.length > WORKTREE_TEARDOWN_OUTPUT_MAX_CHARS ? `...${output.slice(-WORKTREE_TEARDOWN_OUTPUT_MAX_CHARS)}` : output;
    throw Object.assign(new Error(`Worktree teardown command failed, so the worktree was kept: ${shown}`), { code: WORKTREE_TEARDOWN_FAILED });
  }
=======
const runWorktreeTeardown = async (worktreeDirectory: string, command: string | undefined, isContributorCheckout: WorktreeRemovalInput['isContributorCheckout']) => {
  if (!String(command || '').trim()) return;
  if (!(await checkPathExists(worktreeDirectory))) return;
  const bootstrap = worktreeBootstrapState.get(await toCanonicalBootstrapStateKey(worktreeDirectory));
  if (bootstrap?.status === WORKTREE_BOOTSTRAP_FAILED) return;
  if (isContributorCheckout instanceof Function) {
    const contributor = await isContributorCheckout(worktreeDirectory).catch((error) => {
      throw Object.assign(new Error(`Could not tell whether this checkout holds a contributor's code, so no teardown command ran and the worktree was kept: ${error?.message || error}`), { code: WORKTREE_TEARDOWN_FAILED });
    });
    if (contributor) return;
  }
  const result = await runWorktreeStartCommand(worktreeDirectory, command, { timeoutMs: WORKTREE_TEARDOWN_TIMEOUT_MS });
  if (!result.success) {
    const shown = shownCommandFailure(result, WORKTREE_TEARDOWN_OUTPUT_MAX_CHARS);
    throw Object.assign(new Error(`Worktree teardown command failed, so the worktree was kept: ${shown}`), { code: WORKTREE_TEARDOWN_FAILED });
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Runs `input.teardownCommand` in the registered linked worktree
 * `input.directory` and removes nothing. A delete that also removes the
 * remote branch runs this first, so a failing teardown stops before the
 * remote branch goes. Anything that is not a registered linked worktree has
 * nothing to tear down.
 */
export async function teardownWorktree(directory, input = {}) {
 const targetDirectory = normalizeDirectoryPath(input?.directory);
 if (!targetDirectory) throw new Error('Worktree directory is required');
 const targetCanonical = await canonicalPath(targetDirectory);
 await waitForActiveWorktreeBootstrap(targetDirectory);
 await waitForActiveWorktreeBootstrap(targetCanonical);
 const context = await resolveWorktreeProjectContext(directory, { tolerateWorktreeRootConfigError: true });
 if (targetCanonical === await canonicalPath(context.primaryWorktree)) {
  throw new Error('Cannot tear down the primary workspace');
 }
 const entry = await findRegisteredWorktree(context.primaryWorktree, targetCanonical);
 if (entry?.worktree) await runWorktreeTeardown(entry.worktree, input?.teardownCommand, input?.isContributorCheckout);
 return true;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Runs `input.teardownCommand` in the registered linked worktree
 * `input.directory` and removes nothing. A delete that also removes the
 * remote branch runs this first, so a failing teardown stops before the
 * remote branch goes. Anything that is not a registered linked worktree has
 * nothing to tear down.
 */
export async function teardownWorktree(directory, input = {}) {
  const targetDirectory = normalizeDirectoryPath(input?.directory);
  if (!targetDirectory) throw new Error('Worktree directory is required');
  const targetCanonical = await canonicalPath(targetDirectory);
  await waitForActiveWorktreeBootstrap(targetDirectory);
  await waitForActiveWorktreeBootstrap(targetCanonical);
  const context = await resolveWorktreeProjectContext(directory, { tolerateWorktreeRootConfigError: true });
  if (targetCanonical === await canonicalPath(context.primaryWorktree)) {
    throw new Error('Cannot tear down the primary workspace');
  }
  const entry = await findRegisteredWorktree(context.primaryWorktree, targetCanonical);
  if (entry?.worktree) await runWorktreeTeardown(entry.worktree, input?.teardownCommand, input?.isContributorCheckout);
  return true;
=======
export async function teardownWorktree(directory: string, input: WorktreeRemovalInput = {}) {
  const targetDirectory = input?.directory === undefined ? undefined : normalizeDirectoryPath(input.directory);
  if (!targetDirectory) throw new Error('Worktree directory is required');
  const targetCanonical = await canonicalPath(targetDirectory);
  await waitForActiveWorktreeBootstrap(targetDirectory);
  await waitForActiveWorktreeBootstrap(targetCanonical);
  const context = await resolveWorktreeProjectContext(directory, { tolerateWorktreeRootConfigError: true });
  if (targetCanonical === await canonicalPath(context.primaryWorktree)) {
    throw new Error('Cannot tear down the primary workspace');
  }
  const entry = await findRegisteredWorktree(context.primaryWorktree, targetCanonical);
  if (entry?.worktree) await runWorktreeTeardown(entry.worktree, input?.teardownCommand, input?.isContributorCheckout);
  return true;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function removeWorktree(directory, input = {}, { bootstrapStore } = {}) {
 const targetDirectory = normalizeDirectoryPath(input?.directory);
 if (!targetDirectory) {
  throw new Error('Worktree directory is required');
 }

 const targetCanonical = await canonicalPath(targetDirectory);
 // A caller throwing the worktree away stops its setup commands; one that
 // never exits would hold the wait below forever.
 if (input?.cancelSetup === true) await cancelWorktreeSetup(targetDirectory);
 await waitForActiveWorktreeBootstrap(targetDirectory);
 await waitForActiveWorktreeBootstrap(targetCanonical);

 const context = await resolveWorktreeProjectContext(directory, { tolerateWorktreeRootConfigError: true });
 const deleteLocalBranch = input?.deleteLocalBranch === true;

 const primaryCanonical = await canonicalPath(context.primaryWorktree);
 if (targetCanonical === primaryCanonical) {
  throw new Error('Cannot remove the primary workspace');
 }
 const worktreeRootCanonical = await canonicalPath(context.worktreeRoot);
 const defaultWorktreeRootCanonical = context.defaultWorktreeRoot
  ? await canonicalPath(context.defaultWorktreeRoot)
  : null;

 const entries = await listWorktreeEntries(context.primaryWorktree);
 const matchedEntry = await (async () => {
  for (const entry of entries) {
   if (!entry?.worktree) {
    continue;
   }
   const entryCanonical = await canonicalPath(entry.worktree);
   if (entryCanonical === targetCanonical) {
    return entry;
   }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function removeWorktree(directory, input = {}, { bootstrapStore } = {}) {
  const targetDirectory = normalizeDirectoryPath(input?.directory);
  if (!targetDirectory) {
    throw new Error('Worktree directory is required');
=======
export async function removeWorktree(directory: string, input: WorktreeRemovalInput = {}, { bootstrapStore }: BootstrapOptions = {}) {
  const targetDirectory = input?.directory === undefined ? undefined : normalizeDirectoryPath(input.directory);
  if (!targetDirectory) {
    throw new Error('Worktree directory is required');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  return null;
 })();

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const removeManagedOrphan = async ({ registered }) => {
  // The data-dir root is ours alone, so any leftover inside it may go. A
  // configured worktreeDirectory can be shared (".." is the repository's
  // parent, holding sibling projects), so there only a directory git had
  // registered as this project's worktree is deleted; an unregistered one
  // could be anything.
  const insideDefaultRoot = defaultWorktreeRootCanonical !== null
   && targetCanonical !== defaultWorktreeRootCanonical
   && isInsideOrSameDirectory(defaultWorktreeRootCanonical, targetCanonical);
  const insideConfiguredRoot = targetCanonical !== worktreeRootCanonical
   && isInsideOrSameDirectory(worktreeRootCanonical, targetCanonical);
  const isManagedOrphan = insideDefaultRoot || (registered && insideConfiguredRoot);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const targetCanonical = await canonicalPath(targetDirectory);
  // A caller throwing the worktree away stops its setup commands; one that
  // never exits would hold the wait below forever.
  if (input?.cancelSetup === true) await cancelWorktreeSetup(targetDirectory);
  await waitForActiveWorktreeBootstrap(targetDirectory);
  await waitForActiveWorktreeBootstrap(targetCanonical);
=======
  const targetCanonical = await canonicalPath(targetDirectory);
  if (input?.cancelSetup === true) await cancelWorktreeSetup(targetDirectory);
  await waitForActiveWorktreeBootstrap(targetDirectory);
  await waitForActiveWorktreeBootstrap(targetCanonical);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  await clearWorktreeBootstrapState(targetDirectory, bootstrapStore);
  const targetExists = await checkPathExists(targetDirectory);
  if (targetExists && isManagedOrphan) {
   await removeBusyDirectory(targetDirectory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const context = await resolveWorktreeProjectContext(directory, { tolerateWorktreeRootConfigError: true });
  const deleteLocalBranch = input?.deleteLocalBranch === true;

  const primaryCanonical = await canonicalPath(context.primaryWorktree);
  if (targetCanonical === primaryCanonical) {
    throw new Error('Cannot remove the primary workspace');
  }
  const worktreeRootCanonical = await canonicalPath(context.worktreeRoot);
  const legacyWorktreeRootCanonical = context.legacyWorktreeRoot
    ? await canonicalPath(context.legacyWorktreeRoot)
    : null;

  const entries = await listWorktreeEntries(context.primaryWorktree);
  const matchedEntry = await (async () => {
    for (const entry of entries) {
      if (!entry?.worktree) {
        continue;
      }
      const entryCanonical = await canonicalPath(entry.worktree);
      if (entryCanonical === targetCanonical) {
        return entry;
      }
    }
    return null;
  })();

  const removeManagedOrphan = async ({ registered }) => {
    // The data-dir root is ours alone, so any leftover inside it may go. A
    // configured worktree.directory can be shared (".." is the repository's
    // parent, holding sibling projects), so there only a directory git had
    // registered as this project's worktree is deleted; an unregistered one
    // could be anything.
    const insideLegacyRoot = legacyWorktreeRootCanonical !== null
      && targetCanonical !== legacyWorktreeRootCanonical
      && isInsideOrSameDirectory(legacyWorktreeRootCanonical, targetCanonical);
    const insideConfiguredRoot = targetCanonical !== worktreeRootCanonical
      && isInsideOrSameDirectory(worktreeRootCanonical, targetCanonical);
    const isManagedOrphan = insideLegacyRoot || (registered && insideConfiguredRoot);

    await clearWorktreeBootstrapState(targetDirectory, bootstrapStore);
    const targetExists = await checkPathExists(targetDirectory);
    if (targetExists && isManagedOrphan) {
      await removeBusyDirectory(targetDirectory);
    }
    // A removal git abandoned halfway leaves `.git/worktrees/<name>` without
    // its gitdir; prune drops that metadata so it cannot linger.
    await runGitCommand(context.primaryWorktree, ['worktree', 'prune']);
  };

  if (!matchedEntry?.worktree) {
    await removeManagedOrphan({ registered: false });
    return true;
  }

  await runWorktreeTeardown(matchedEntry.worktree, input?.teardownCommand, input?.isContributorCheckout);

  await clearWorktreeBootstrapState(matchedEntry.worktree, bootstrapStore);
  const settleRemoval = trackWorktreeRemoval(targetCanonical);
  // The directory is a registered linked worktree and still exists here, which
  // is the only point where its OpenCode instance can be released by path.
  const releaseInstance = () => disposeWorktreeInstanceBestEffort(input?.disposeInstance, matchedEntry.worktree);
  try {
    await releaseInstance();

    const restoreGitDirectoryLink = await replaceWorktreeGitDirectoryLink(context.primaryWorktree, matchedEntry.worktree);
    try {
      const removedByGit = await removeGitWorktreeWhenFree(context.primaryWorktree, matchedEntry.worktree, targetCanonical, releaseInstance);
      if (!removedByGit) {
        // Git deleted its registration but not the still-locked folder.
        await removeManagedOrphan({ registered: true });
      }
    } catch (error) {
      if (restoreGitDirectoryLink) {
        await restoreGitDirectoryLink().catch((restoreError) => {
          console.warn('Failed to restore worktree .git symlink after removal failed:', restoreError);
        });
      }
      throw error;
    }
  } finally {
    settleRemoval();
  }
  await publishWorktreeTopologyChange(context.primaryWorktree);

  if (deleteLocalBranch) {
    const branchName = cleanBranchName(String(matchedEntry.branchRef || matchedEntry.branch || '').trim());
    if (branchName && !(await isBranchKeptOnWorktreeRemoval(context.primaryWorktree, branchName))) {
      await runGitCommandOrThrow(
        context.primaryWorktree,
        ['branch', '-D', branchName],
        `Failed to delete local branch ${branchName}`
      );
    }
=======
  const context = await resolveWorktreeProjectContext(directory, { tolerateWorktreeRootConfigError: true });
  const deleteLocalBranch = input?.deleteLocalBranch === true;

  const primaryCanonical = await canonicalPath(context.primaryWorktree);
  if (targetCanonical === primaryCanonical) {
    throw new Error('Cannot remove the primary workspace');
  }
  const worktreeRootCanonical = await canonicalPath(context.worktreeRoot);
  const legacyWorktreeRootCanonical = context.legacyWorktreeRoot
    ? await canonicalPath(context.legacyWorktreeRoot)
    : null;

  const entries = await listWorktreeEntries(context.primaryWorktree);
  const matchedEntry = await (async () => {
    for (const entry of entries) {
      if (!entry?.worktree) {
        continue;
      }
      const entryCanonical = await canonicalPath(entry.worktree);
      if (entryCanonical === targetCanonical) {
        return entry;
      }
    }
    return null;
  })();

  const removeManagedOrphan = async ({ registered }: { registered: boolean }) => {
    const insideLegacyRoot = legacyWorktreeRootCanonical !== null
      && targetCanonical !== legacyWorktreeRootCanonical
      && isInsideOrSameDirectory(legacyWorktreeRootCanonical, targetCanonical);
    const insideConfiguredRoot = targetCanonical !== worktreeRootCanonical
      && isInsideOrSameDirectory(worktreeRootCanonical, targetCanonical);
    const isManagedOrphan = insideLegacyRoot || (registered && insideConfiguredRoot);

    await clearWorktreeBootstrapState(targetDirectory, bootstrapStore);
    const targetExists = await checkPathExists(targetDirectory);
    if (targetExists && isManagedOrphan) {
      await removeBusyDirectory(targetDirectory);
    }
    await runGitCommand(context.primaryWorktree, ['worktree', 'prune']);
  };

  if (!matchedEntry?.worktree) {
    await removeManagedOrphan({ registered: false });
    return true;
  }

  await runWorktreeTeardown(matchedEntry.worktree, input?.teardownCommand, input?.isContributorCheckout);

  await clearWorktreeBootstrapState(matchedEntry.worktree, bootstrapStore);
  const createdByCommand = await readWorktreeCreatedByCommand(matchedEntry.worktree);
  const settleRemoval = trackWorktreeRemoval(targetCanonical);
  const releaseInstance = () => disposeWorktreeInstanceBestEffort(input?.disposeInstance, matchedEntry.worktree);
  try {
    await releaseInstance();

    const restoreGitDirectoryLink = await replaceWorktreeGitDirectoryLink(context.primaryWorktree, matchedEntry.worktree);
    try {
      const overrideLock = matchedEntry.locked === true && createdByCommand !== null;
      const removedByGit = await removeGitWorktreeWhenFree(context.primaryWorktree, matchedEntry.worktree, targetCanonical, releaseInstance, overrideLock);
      if (!removedByGit) {
        await removeManagedOrphan({ registered: true });
      }
      await removeCreateCommandLink(createdByCommand?.link, matchedEntry.worktree);
    } catch (error) {
      if (restoreGitDirectoryLink) {
        await restoreGitDirectoryLink().catch((restoreError) => {
          console.warn('Failed to restore worktree .git symlink after removal failed:', restoreError);
        });
      }
      throw error;
    }
  } finally {
    settleRemoval();
  }
  await publishWorktreeTopologyChange(context.primaryWorktree);

  if (deleteLocalBranch) {
    const branchName = cleanBranchName(String(matchedEntry.branchRef || matchedEntry.branch || '').trim());
    if (branchName && !(await isBranchKeptOnWorktreeRemoval(context.primaryWorktree, branchName))) {
      await runGitCommandOrThrow(
        context.primaryWorktree,
        ['branch', '-D', branchName],
        `Failed to delete local branch ${branchName}`
      );
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  // A removal git abandoned halfway leaves `.git/worktrees/<name>` without
  // its gitdir; prune drops that metadata so it cannot linger.
  await runGitCommand(context.primaryWorktree, ['worktree', 'prune']);
 };

 if (!matchedEntry?.worktree) {
  await removeManagedOrphan({ registered: false });
  return true;
 }

 await runWorktreeTeardown(matchedEntry.worktree, input?.teardownCommand, input?.isContributorCheckout);

 await clearWorktreeBootstrapState(matchedEntry.worktree, bootstrapStore);
 const settleRemoval = trackWorktreeRemoval(targetCanonical);
 // The directory is a registered linked worktree and still exists here, which
 // is the only point where its OpenCode instance can be released by path.
 const releaseInstance = () => disposeWorktreeInstanceBestEffort(input?.disposeInstance, matchedEntry.worktree);
 try {
  await releaseInstance();

  const restoreGitDirectoryLink = await replaceWorktreeGitDirectoryLink(context.primaryWorktree, matchedEntry.worktree);
  try {
   const removedByGit = await removeGitWorktreeWhenFree(context.primaryWorktree, matchedEntry.worktree, targetCanonical, releaseInstance);
   if (!removedByGit) {
    // Git deleted its registration but not the still-locked folder.
    await removeManagedOrphan({ registered: true });
   }
  } catch (error) {
   if (restoreGitDirectoryLink) {
    await restoreGitDirectoryLink().catch((restoreError) => {
     console.warn('Failed to restore worktree .git symlink after removal failed:', restoreError);
    });
   }
   throw error;
  }
 } finally {
  settleRemoval();
 }
 await publishWorktreeTopologyChange(context.primaryWorktree);

 if (deleteLocalBranch) {
  const branchName = cleanBranchName(String(matchedEntry.branchRef || matchedEntry.branch || '').trim());
  if (branchName && !(await isBranchKeptOnWorktreeRemoval(context.primaryWorktree, branchName))) {
   await runGitCommandOrThrow(
    context.primaryWorktree,
    ['branch', '-D', branchName],
    `Failed to delete local branch ${branchName}`
   );
  }
 }

 return true;
}

const RUN_SNAPSHOT_REF_PATTERN = /^refs\/openchamber\/runs\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const assertRunSnapshotRef = (ref) => {
 const value = typeof ref === 'string' ? ref.trim() : '';
 if (!RUN_SNAPSHOT_REF_PATTERN.test(value) || value.includes('..')) {
  throw new Error('Invalid snapshot ref');
 }
 return value;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const assertRunSnapshotRef = (ref) => {
  const value = typeof ref === 'string' ? ref.trim() : '';
  if (!RUN_SNAPSHOT_REF_PATTERN.test(value) || value.includes('..')) {
    throw new Error('Invalid snapshot ref');
  }
  return value;
=======
const assertRunSnapshotRef = <Ref>(ref: Ref) => {
  const value = isPrimitiveString(ref) ? ref.trim() : '';
  if (!RUN_SNAPSHOT_REF_PATTERN.test(value) || value.includes('..')) {
    throw new Error('Invalid snapshot ref');
  }
  return value;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

const SNAPSHOT_IDENTITY_ENV = {
 GIT_AUTHOR_NAME: 'OhPiChamber',
 GIT_AUTHOR_EMAIL: 'snapshot@openchamber.local',
 GIT_COMMITTER_NAME: 'OhPiChamber',
 GIT_COMMITTER_EMAIL: 'snapshot@openchamber.local',
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** The tree of the worktree's current state (every change git does not ignore) on top of HEAD. */
const readWorktreeStateTree = async (worktreeDirectory) => {
 const head = (await runGitCommandOrThrow(worktreeDirectory, ['rev-parse', '--verify', 'HEAD'], 'Worktree has no HEAD commit')).stdout.trim();
 const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'openchamber-snapshot-'));
 const env = { ...(await buildGitEnv(worktreeDirectory)), GIT_INDEX_FILE: path.join(tempDir, 'index') };
 try {
  for (const args of [['read-tree', head], ['add', '-A']]) {
   const result = await runGitCommand(worktreeDirectory, args, { env });
   if (!result.success) throw new Error(result.message || 'Failed to read the worktree state');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Records the complete state of a worktree (committed, staged, unstaged and
 * untracked-but-not-ignored files) as a commit on top of HEAD and points `ref`
 * at it; `oldValue` '' makes git refuse a ref that already exists. A throwaway
 * index is used, so the worktree's real index, HEAD, branch and files are
 * untouched.
 */
/** The tree of the worktree's current state (every change git does not ignore) on top of HEAD. */
const readWorktreeStateTree = async (worktreeDirectory) => {
  const head = (await runGitCommandOrThrow(worktreeDirectory, ['rev-parse', '--verify', 'HEAD'], 'Worktree has no HEAD commit')).stdout.trim();
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'openchamber-snapshot-'));
  const env = { ...(await buildGitEnv(worktreeDirectory)), GIT_INDEX_FILE: path.join(tempDir, 'index') };
  try {
    for (const args of [['read-tree', head], ['add', '-A']]) {
      const result = await runGitCommand(worktreeDirectory, args, { env });
      if (!result.success) throw new Error(result.message || 'Failed to read the worktree state');
    }
    const tree = await runGitCommand(worktreeDirectory, ['write-tree'], { env });
    if (!tree.success) throw new Error(tree.message || 'Failed to read the worktree state');
    return { head, tree: tree.stdout.trim() };
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
=======
const readWorktreeStateTree = async (worktreeDirectory: string) => {
  const head = (await runGitCommandOrThrow(worktreeDirectory, ['rev-parse', '--verify', 'HEAD'], 'Worktree has no HEAD commit')).stdout.trim();
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'openchamber-snapshot-'));
  const env = { ...(await buildGitEnv(worktreeDirectory)), GIT_INDEX_FILE: path.join(tempDir, 'index') };
  try {
    for (const args of [['read-tree', head], ['add', '-A']]) {
      const result = await runGitCommand(worktreeDirectory, args, { env });
      if (!result.success) throw new Error(result.message || 'Failed to read the worktree state');
    }
    const tree = await runGitCommand(worktreeDirectory, ['write-tree'], { env });
    if (!tree.success) throw new Error(tree.message || 'Failed to read the worktree state');
    return { head, tree: tree.stdout.trim() };
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  const tree = await runGitCommand(worktreeDirectory, ['write-tree'], { env });
  if (!tree.success) throw new Error(tree.message || 'Failed to read the worktree state');
  return { head, tree: tree.stdout.trim() };
 } finally {
  await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
 }
};
// Fingerprint both content and the real index: tree equality alone cannot
// distinguish staged changes or conflict stages from a completed apply.
const fingerprintWorktreeRestore = async (directory) => {
 const { head, tree } = await readWorktreeStateTree(directory);
 const env = await buildGitEnv(directory);
 const readBytes = async (args) => {
  const { stdout } = await execFileAsync(getGitBinary(), args, {
   cwd: directory, env, encoding: 'buffer', windowsHide: true, maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
 };
 const [index, unmerged, status] = await Promise.all([
  readBytes(['ls-files', '--stage', '-z']),
  readBytes(['ls-files', '--unmerged', '-z']),
  readBytes(['status', '--porcelain=v2', '--untracked-files=all', '-z']),
 ]);
 const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
 return { head, tree, index: digest(index), unmerged: digest(unmerged), status: digest(status), conflicts: unmerged.length > 0 };
};
const applyWorktreeArchiveSnapshot = async (directory, archive) => {
 const trees = await runGitCommandOrThrow(directory, ['rev-parse', `${archive.commit}^{tree}`, `${archive.head}^{tree}`], 'Failed to read the worktree archive');
 const [snapshotTree, headTree] = trees.stdout.trim().split('\n');
 if (snapshotTree === headTree) return false;
 const env = { ...(await buildGitEnv(directory)), ...SNAPSHOT_IDENTITY_ENV };
 const applied = await runGitCommand(directory, ['cherry-pick', '--no-commit', archive.commit], { env });
 if (applied.success) {
  await runGitCommandOrThrow(directory, ['reset', '--quiet'], 'Failed to unstage the restored changes');
  return false;
 }
 const unmerged = await runGitCommand(directory, ['ls-files', '--unmerged']);
 if (!unmerged.success || !unmerged.stdout.trim())
  throw worktreeArchiveError(`The archived changes could not be applied (${applied.message || 'git refused'}). The archive is kept.`, 'WORKTREE_ARCHIVE_NOT_APPLIED', 409);
 return true;
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const commitSnapshot = async (directory, { ref, message, oldValue, head, tree }) => {
 const env = { ...(await buildGitEnv(directory)), ...SNAPSHOT_IDENTITY_ENV };
 const commit = await runGitCommand(directory, ['commit-tree', tree, '-p', head, '-m', message], { env });
 if (!commit.success) throw new Error(commit.message || 'Failed to write snapshot commit');
 const commitSha = commit.stdout.trim();
 await runGitCommandOrThrow(directory, ['update-ref', ref, commitSha, ...(oldValue === undefined ? [] : [oldValue])], 'Failed to store snapshot ref');
 return { ref, commit: commitSha, head };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const commitSnapshot = async (directory, { ref, message, oldValue, head, tree }) => {
  const env = { ...(await buildGitEnv(directory)), ...SNAPSHOT_IDENTITY_ENV };
  const commit = await runGitCommand(directory, ['commit-tree', tree, '-p', head, '-m', message], { env });
  if (!commit.success) throw new Error(commit.message || 'Failed to write snapshot commit');
  const commitSha = commit.stdout.trim();
  await runGitCommandOrThrow(directory, ['update-ref', ref, commitSha, ...(oldValue === undefined ? [] : [oldValue])], 'Failed to store snapshot ref');
  return { ref, commit: commitSha, head };
=======
const commitSnapshot = async (directory: string, { ref, message, oldValue, head, tree }: SnapshotOptions & { head: string; tree: string }) => {
  const env = { ...(await buildGitEnv(directory)), ...SNAPSHOT_IDENTITY_ENV };
  const commit = await runGitCommand(directory, ['commit-tree', tree, '-p', head, '-m', message], { env });
  if (!commit.success) throw new Error(commit.message || 'Failed to write snapshot commit');
  const commitSha = commit.stdout.trim();
  await runGitCommandOrThrow(directory, ['update-ref', ref, commitSha, ...(oldValue === undefined ? [] : [oldValue])], 'Failed to store snapshot ref');
  return { ref, commit: commitSha, head };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const writeWorktreeSnapshot = async (worktreeDirectory, options) => (
 commitSnapshot(worktreeDirectory, { ...options, ...(await readWorktreeStateTree(worktreeDirectory)) })
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const writeWorktreeSnapshot = async (worktreeDirectory, options) => (
  commitSnapshot(worktreeDirectory, { ...options, ...(await readWorktreeStateTree(worktreeDirectory)) })
=======
const writeWorktreeSnapshot = async (worktreeDirectory: string, options: SnapshotOptions) => (
  commitSnapshot(worktreeDirectory, { ...options, ...(await readWorktreeStateTree(worktreeDirectory)) })
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
);

<<<<<<< HEAD:packages/web/server/lib/git/service.js

/** A run's snapshot of its worktree, under `refs/openchamber/runs/`. */

/**
 * Records the complete state of a worktree (committed, staged, unstaged and
 * untracked-but-not-ignored files) as a commit under `ref`. A throwaway index
 * is used, so the worktree's real index, HEAD, branch and files are untouched.
 */
export async function snapshotWorktree(directory, input = {}) {
 const worktreeDirectory = normalizeDirectoryPath(directory);
 if (!worktreeDirectory) {
  throw new Error('Worktree directory is required');
 }
 const ref = assertRunSnapshotRef(input?.ref);
 return writeWorktreeSnapshot(worktreeDirectory, { ref, message: 'OhPiChamber run snapshot' });
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** A run's snapshot of its worktree, under `refs/openchamber/runs/`. */
export async function snapshotWorktree(directory, input = {}) {
  const worktreeDirectory = normalizeDirectoryPath(directory);
  if (!worktreeDirectory) {
    throw new Error('Worktree directory is required');
  }
  const ref = assertRunSnapshotRef(input?.ref);
  return writeWorktreeSnapshot(worktreeDirectory, { ref, message: 'OpenChamber run snapshot' });
=======
export async function snapshotWorktree(directory: string, input: { ref?: unknown } = {}) {
  const worktreeDirectory = normalizeDirectoryPath(directory);
  if (!worktreeDirectory) {
    throw new Error('Worktree directory is required');
  }
  const ref = assertRunSnapshotRef(input?.ref);
  return writeWorktreeSnapshot(worktreeDirectory, { ref, message: 'OpenChamber run snapshot' });
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

const WORKTREE_ARCHIVE_REF_PREFIX = 'refs/openchamber/archive/';
const WORKTREE_ARCHIVE_SUBJECT = 'OpenChamber worktree archive';
const WORKTREE_ARCHIVE_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

const worktreeArchiveError = (message, code, status) => Object.assign(
 new Error(message),
 code === undefined ? {} : { code },
 status === undefined ? {} : { status },
);

const worktreeArchiveIdSchema = z.string().trim().regex(WORKTREE_ARCHIVE_ID_PATTERN);

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const assertWorktreeArchiveId = (id) => {
 const parsed = worktreeArchiveIdSchema.safeParse(id);
 if (!parsed.success) throw worktreeArchiveError('Invalid worktree archive id', undefined, 400);
 return parsed.data;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const assertWorktreeArchiveId = (id) => {
  const parsed = worktreeArchiveIdSchema.safeParse(id);
  if (!parsed.success) throw new Error('Invalid worktree archive id');
  return parsed.data;
=======
const assertWorktreeArchiveId = <Id>(id: Id) => {
  const parsed = worktreeArchiveIdSchema.safeParse(id);
  if (!parsed.success) throw new Error('Invalid worktree archive id');
  return parsed.data;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

const sessionIdListSchema = z.array(z.unknown()).catch([])
 .transform((entries) => entries.flatMap((entry) => {
  const parsed = z.string().min(1).safeParse(entry);
  return parsed.success ? [parsed.data] : [];
 }));

const worktreeArchiveRecordSchema = z.object({
 path: z.string().min(1),
 branch: z.string().catch(''),
 title: z.string().catch(''),
 archivedAt: z.number().finite().catch(0),
 sessionIds: sessionIdListSchema,
});

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** The archive record in a snapshot commit's message, or null when it is not one. */
const parseWorktreeArchiveMessage = (message) => {
 const text = String(message || '');
 if (!text.startsWith(WORKTREE_ARCHIVE_SUBJECT)) return null;
 try {
  return worktreeArchiveRecordSchema.safeParse(JSON.parse(text.slice(WORKTREE_ARCHIVE_SUBJECT.length).trim())).data ?? null;
 } catch {
  return null;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** The archive record in a snapshot commit's message, or null when it is not one. */
const parseWorktreeArchiveMessage = (message) => {
  const text = String(message || '');
  if (!text.startsWith(WORKTREE_ARCHIVE_SUBJECT)) return null;
  try {
    return worktreeArchiveRecordSchema.safeParse(JSON.parse(text.slice(WORKTREE_ARCHIVE_SUBJECT.length).trim())).data ?? null;
  } catch {
    return null;
  }
=======
const parseWorktreeArchiveMessage = (message: string) => {
  const text = String(message || '');
  if (!text.startsWith(WORKTREE_ARCHIVE_SUBJECT)) return null;
  try {
    return worktreeArchiveRecordSchema.safeParse(JSON.parse(text.slice(WORKTREE_ARCHIVE_SUBJECT.length).trim())).data ?? null;
  } catch {
    return null;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const readWorktreeArchives = async (primaryWorktree) => {
 const listing = await runGitCommandOrThrow(primaryWorktree, [
  'for-each-ref',
  '--format=%(refname)%00%(objectname)%00%(parent)%00%(contents)%1e',
  WORKTREE_ARCHIVE_REF_PREFIX,
 ], 'Failed to list worktree archives');
 const branches = await runGitCommand(primaryWorktree, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']);
 const localBranches = new Set(branches.success ? String(branches.stdout || '').split('\n').map((line) => line.trim()).filter(Boolean) : []);
 return String(listing.stdout || '').split('\x1e').flatMap((chunk) => {
  const [ref = '', commit = '', head = '', message = ''] = chunk.replace(/^\n/, '').split('\0');
  if (!ref.startsWith(WORKTREE_ARCHIVE_REF_PREFIX)) return [];
  const record = parseWorktreeArchiveMessage(message);
  if (!record) return [];
  const id = ref.slice(WORKTREE_ARCHIVE_REF_PREFIX.length);
  if (!WORKTREE_ARCHIVE_ID_PATTERN.test(id)) return [];
  return [{ id, ref, commit, head: head.split(' ')[0] || '', ...record, branchExists: Boolean(record.branch) && localBranches.has(record.branch) }];
 }).sort((a, b) => b.archivedAt - a.archivedAt);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const readWorktreeArchives = async (primaryWorktree) => {
  const listing = await runGitCommandOrThrow(primaryWorktree, [
    'for-each-ref',
    '--format=%(refname)%00%(objectname)%00%(parent)%00%(contents)%1e',
    WORKTREE_ARCHIVE_REF_PREFIX,
  ], 'Failed to list worktree archives');
  const branches = await runGitCommand(primaryWorktree, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']);
  const localBranches = new Set(branches.success ? String(branches.stdout || '').split('\n').map((line) => line.trim()).filter(Boolean) : []);
  return String(listing.stdout || '').split('\x1e').flatMap((chunk) => {
    const [ref = '', commit = '', head = '', message = ''] = chunk.replace(/^\n/, '').split('\0');
    if (!ref.startsWith(WORKTREE_ARCHIVE_REF_PREFIX)) return [];
    const record = parseWorktreeArchiveMessage(message);
    if (!record) return [];
    const id = ref.slice(WORKTREE_ARCHIVE_REF_PREFIX.length);
    return [{ id, ref, commit, head: head.split(' ')[0] || '', ...record, branchExists: Boolean(record.branch) && localBranches.has(record.branch) }];
  }).sort((a, b) => b.archivedAt - a.archivedAt);
=======
const readWorktreeArchives = async (primaryWorktree: string) => {
  const listing = await runGitCommandOrThrow(primaryWorktree, [
    'for-each-ref',
    '--format=%(refname)%00%(objectname)%00%(parent)%00%(contents)%1e',
    WORKTREE_ARCHIVE_REF_PREFIX,
  ], 'Failed to list worktree archives');
  const branches = await runGitCommand(primaryWorktree, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']);
  const localBranches = new Set(branches.success ? String(branches.stdout || '').split('\n').map((line) => line.trim()).filter(Boolean) : []);
  return String(listing.stdout || '').split('\x1e').flatMap((chunk) => {
    const [ref = '', commit = '', head = '', message = ''] = chunk.replace(/^\n/, '').split('\0');
    if (!ref.startsWith(WORKTREE_ARCHIVE_REF_PREFIX)) return [];
    const record = parseWorktreeArchiveMessage(message);
    if (!record) return [];
    const id = ref.slice(WORKTREE_ARCHIVE_REF_PREFIX.length);
    return [{ id, ref, commit, head: head.split(' ')[0] || '', ...record, branchExists: Boolean(record.branch) && localBranches.has(record.branch) }];
  }).sort((a, b) => b.archivedAt - a.archivedAt);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
const readWorktreeArchive = async (primaryWorktree, id) => {
 const archiveId = assertWorktreeArchiveId(id);
 const archive = (await readWorktreeArchives(primaryWorktree)).find((entry) => entry.id === archiveId);
 if (!archive) throw worktreeArchiveError('Worktree archive not found', 'WORKTREE_ARCHIVE_NOT_FOUND', 404);
 return archive;
};

// A directory that resolves to no repository, or not to a checkout of one,
// is a caller mistake rather than a server fault.
const resolveWorktreeArchiveProjectContext = async (directory) => {
 try {
  return await resolveWorktreeProjectContext(directory, { tolerateWorktreeRootConfigError: true });
 } catch (error) {
  throw worktreeArchiveError(
   error instanceof Error ? error.message : 'The directory does not resolve to a Git checkout',
   undefined,
   400,
  );
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const readWorktreeArchive = async (primaryWorktree, id) => {
  const archiveId = assertWorktreeArchiveId(id);
  const archive = (await readWorktreeArchives(primaryWorktree)).find((entry) => entry.id === archiveId);
  if (!archive) throw Object.assign(new Error('Worktree archive not found'), { code: 'WORKTREE_ARCHIVE_NOT_FOUND' });
  return archive;
=======
const readWorktreeArchive = async <Id>(primaryWorktree: string, id: Id) => {
  const archiveId = assertWorktreeArchiveId(id);
  const archive = (await readWorktreeArchives(primaryWorktree)).find((entry) => entry.id === archiveId);
  if (!archive) throw Object.assign(new Error('Worktree archive not found'), { code: 'WORKTREE_ARCHIVE_NOT_FOUND' });
  return archive;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** The repository's archived worktrees, newest first. `directory` is any of its checkouts. */
export async function listWorktreeArchives(directory) {
 const context = await resolveWorktreeArchiveProjectContext(directory);
 return readWorktreeArchives(context.primaryWorktree);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** The repository's archived worktrees, newest first. `directory` is any of its checkouts. */
export async function listWorktreeArchives(directory) {
  const context = await resolveWorktreeProjectContext(directory, { tolerateWorktreeRootConfigError: true });
  return readWorktreeArchives(context.primaryWorktree);
=======
export async function listWorktreeArchives(directory: string) {
  const context = await resolveWorktreeProjectContext(directory, { tolerateWorktreeRootConfigError: true });
  return readWorktreeArchives(context.primaryWorktree);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
// Worktrees being archived, by canonical path: a second archive of the same
// worktree (Done racing the merged-PR cleanup) would snapshot a folder git is
// deleting. Overlap with another archive is refused by the Agent Service lease.
const worktreeArchivesInFlight = new Set();
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
// Worktrees being archived, by canonical path: a second archive of the same
// worktree (Done racing the merged-PR cleanup) would snapshot a folder git is
// deleting.
const worktreeArchivesInFlight = new Set();
=======
const worktreeArchivesInFlight = new Set<string>();
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Archives the linked worktree `input.directory` of the repository at
 * `directory`: every worker the Agent Service holds at that folder is released
 * first, then its state is recorded under `refs/openchamber/archive/<id>` with
 * the sessions the caller archived for it, and the worktree is removed the way
 * `removeWorktree` removes it, keeping its branch. A removal that leaves the
 * folder whole deletes the archive again; one that leaves it partly deleted
 * keeps the archive and reports `WORKTREE_ARCHIVE_PARTIAL`.
 */
export async function archiveWorktree(directory, input = {}, options = {}) {
 const id = assertWorktreeArchiveId(input?.id);
 const worktreeDirectory = normalizeDirectoryPath(input?.directory);
 if (!worktreeDirectory) throw worktreeArchiveError('Worktree directory is required', undefined, 400);
 const { bootstrapStore, worktreeWorkers, archiveSessions } = options ?? {};
 if (!archiveSessions) {
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
const worktreeArchiveError = (message, code) => Object.assign(new Error(message), { code });

/**
 * Archives the linked worktree `input.directory` of the repository at
 * `directory`: its state is recorded under `refs/openchamber/archive/<id>`
 * with the sessions the caller archived for it, then the worktree is removed
 * the way `removeWorktree` removes it, keeping its branch. A removal that fails
 * deletes the archive again, so a worktree is never both on disk and archived.
 */
export async function archiveWorktree(directory, input = {}, options = {}) {
  const id = assertWorktreeArchiveId(input?.id);
  const worktreeDirectory = normalizeDirectoryPath(input?.directory);
  if (!worktreeDirectory) throw new Error('Worktree directory is required');
=======
const worktreeArchiveError = (message: string, code: string) => Object.assign(new Error(message), { code });

export async function archiveWorktree(directory: string, input: WorktreeArchiveInput = {}, options: BootstrapOptions = {}) {
  const id = assertWorktreeArchiveId(input?.id);
  const worktreeDirectory = input?.directory === undefined ? undefined : normalizeDirectoryPath(input.directory);
  if (!worktreeDirectory) throw new Error('Worktree directory is required');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  const context = await resolveWorktreeProjectContext(directory, { tolerateWorktreeRootConfigError: true });
  const targetCanonical = await canonicalPath(worktreeDirectory);
<<<<<<< HEAD:packages/web/server/lib/git/service.js
  return archiveRegisteredWorktree({ directory, id, worktreeDirectory, targetCanonical, context, input, options });
 }
 if (worktreeWorkers && (!(worktreeWorkers.acquire instanceof Function) || !(worktreeWorkers.release instanceof Function))) {
  throw worktreeArchiveError('Worker lifecycle control is not available', undefined, 501);
 }
 if (!(archiveSessions?.captureWorktreeArchive instanceof Function)
  || !(archiveSessions?.prepareWorktreeArchiveRemoval instanceof Function)
  || !(archiveSessions?.finishWorktreeArchive instanceof Function)
  || !(archiveSessions?.rollbackWorktreeArchive instanceof Function)
  || !(archiveSessions?.discardWorktreeArchive instanceof Function)) {
  throw worktreeArchiveError('Host archive authority is not available', 'SERVICE_UNAVAILABLE', 503);
 }
 const context = await resolveWorktreeArchiveProjectContext(directory);
 const targetCanonical = await canonicalPath(worktreeDirectory);
 if (targetCanonical === await canonicalPath(context.primaryWorktree)) {
  throw worktreeArchiveError('Cannot archive the primary workspace', undefined, 400);
 }
 // Only a checkout git registers here: the removal below would otherwise
 // treat the folder as a leftover and delete it without a trace in git.
 if (!(await findRegisteredWorktree(context.primaryWorktree, targetCanonical))) {
  throw worktreeArchiveError('Not a worktree of this repository', undefined, 400);
 }
 if ((await readWorktreeArchives(context.primaryWorktree)).some((entry) => entry.id === id)) {
  throw worktreeArchiveError('This worktree archive id already exists', undefined, 400);
 }
 if (worktreeArchivesInFlight.has(targetCanonical)) {
  throw worktreeArchiveError('This worktree is already being archived', 'WORKTREE_ARCHIVE_IN_PROGRESS', 409);
 }
 worktreeArchivesInFlight.add(targetCanonical);
 // The Host generates the id before the Agent Service sees it, so a lost 201
 // still leaves the host holding the id it must release.
 const leaseId = randomUUID();
 let releaseLease = true;
 try {
  if (worktreeWorkers) await worktreeWorkers.acquire(worktreeDirectory, leaseId);
  // A new worktree's files land in the background: a snapshot taken before
  // they do records every missing file as deleted. A failure while fetching
  // submodules or LFS objects comes after every file landed, so that worktree
  // archives like any other.
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  if (targetCanonical === await canonicalPath(context.primaryWorktree)) {
    throw new Error('Cannot archive the primary workspace');
  }
  if (worktreeArchivesInFlight.has(targetCanonical)) {
    throw worktreeArchiveError('This worktree is already being archived', 'WORKTREE_ARCHIVE_IN_PROGRESS');
  }
  worktreeArchivesInFlight.add(targetCanonical);
  try {
    return await archiveRegisteredWorktree({ directory, id, worktreeDirectory, targetCanonical, context, input, options });
  } finally {
    worktreeArchivesInFlight.delete(targetCanonical);
  }
}

const findRegisteredWorktree = async (primaryWorktree, targetCanonical) => {
  const entries = await listWorktreeEntries(primaryWorktree);
  const registered = await Promise.all(entries.map(async (entry) => (entry?.worktree ? canonicalPath(entry.worktree) : null)));
  return entries[registered.indexOf(targetCanonical)] ?? null;
};

const archiveRegisteredWorktree = async ({ directory, id, worktreeDirectory, targetCanonical, context, input, options }) => {
  // Only a checkout git registers here: the removal below would otherwise
  // treat the folder as a leftover and delete it without a trace in git.
  const entry = await findRegisteredWorktree(context.primaryWorktree, targetCanonical);
  if (!entry) throw new Error('Not a worktree of this repository');
  // A new worktree's files land in the background: a snapshot taken before
  // they do records every missing file as deleted. A failure while fetching
  // submodules or LFS objects comes after every file landed, so that worktree
  // archives like any other.
=======
  if (targetCanonical === await canonicalPath(context.primaryWorktree)) {
    throw new Error('Cannot archive the primary workspace');
  }
  if (worktreeArchivesInFlight.has(targetCanonical)) {
    throw worktreeArchiveError('This worktree is already being archived', 'WORKTREE_ARCHIVE_IN_PROGRESS');
  }
  worktreeArchivesInFlight.add(targetCanonical);
  try {
    return await archiveRegisteredWorktree({ directory, id, worktreeDirectory, targetCanonical, context, input, options });
  } finally {
    worktreeArchivesInFlight.delete(targetCanonical);
  }
}

const findRegisteredWorktree = async (primaryWorktree: string, targetCanonical: string) => {
  const entries = await listWorktreeEntries(primaryWorktree);
  const registered = await Promise.all(entries.map(async (entry) => (entry?.worktree ? canonicalPath(entry.worktree) : null)));
  return entries[registered.indexOf(targetCanonical)] ?? null;
};

const archiveRegisteredWorktree = async ({ directory, id, worktreeDirectory, targetCanonical, context, input, options }: { directory: string; id: string; worktreeDirectory: string; targetCanonical: string; context: WorktreeProjectContext; input: WorktreeArchiveInput; options: BootstrapOptions }) => {
  const entry = await findRegisteredWorktree(context.primaryWorktree, targetCanonical);
  if (!entry) throw new Error('Not a worktree of this repository');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  await waitForActiveWorktreeBootstrap(worktreeDirectory);
  const bootstrap = worktreeBootstrapState.get(await toCanonicalBootstrapStateKey(worktreeDirectory));
  if (bootstrap?.status === WORKTREE_BOOTSTRAP_FAILED && !bootstrap.hydration) {
   throw worktreeArchiveError(
    'The worktree did not finish setting up, so it cannot be archived. Delete it instead.',
    'WORKTREE_BOOTSTRAP_FAILED',
    409,
   );
  }

  const entry = await findRegisteredWorktree(context.primaryWorktree, targetCanonical);
  const folderGone = entry?.prunable === true && !(await checkPathExists(worktreeDirectory));
  let head = '';
  let branch = '';
  if (folderGone) {
   head = entry.head || '';
   branch = entry.branch || '';
  } else {
   const headResult = await runGitCommand(worktreeDirectory, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
   branch = headResult.success ? String(headResult.stdout || '').trim() : '';
   head = (await runGitCommand(worktreeDirectory, ['rev-parse', 'HEAD'])).stdout?.trim() || '';
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const branch = entry.branch ?? '';
  // The task title; without one, the name the sidebar showed for the work.
  const title = (branch ? toTaskTitle(await readGitConfigValue(context.primaryWorktree, `branch.${branch}.description`)) : '')
    || toTaskTitle(z.string().catch('').parse(input?.title));
=======
  const branch = entry.branch ?? '';
  const title = (branch ? toTaskTitle(await readGitConfigValue(context.primaryWorktree, `branch.${branch}.description`)) : '')
    || toTaskTitle(z.string().catch('').parse(input?.title));
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  const record = {
   path: worktreeDirectory,
   branch,
   title: (branch ? toTaskTitle(await readGitConfigValue(context.primaryWorktree, `branch.${branch}.description`)) : '')
    || toTaskTitle(z.string().catch('').parse(input?.title)),
   archivedAt: Date.now(),
   sessionIds: sessionIdListSchema.parse(input?.sessionIds),
  };
  const ref = `${WORKTREE_ARCHIVE_REF_PREFIX}${id}`;
  const message = `${WORKTREE_ARCHIVE_SUBJECT}\n\n${JSON.stringify(record)}`;
<<<<<<< HEAD:packages/web/server/lib/git/service.js
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  // A folder deleted outside the app leaves nothing to record, so the snapshot
  // equals the commit it stood on. Git also reports a folder that only lost its
  // `.git` file as prunable; its files are still there, so that one must fail.
  const folderGone = entry.prunable === true && !(await checkPathExists(worktreeDirectory));
=======
  const folderGone = entry.prunable === true && !(await checkPathExists(worktreeDirectory));
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  const snapshot = folderGone
<<<<<<< HEAD:packages/web/server/lib/git/service.js
   ? await commitSnapshot(context.primaryWorktree, {
    ref,
    message,
    oldValue: '',
    head: entry.head,
    tree: (await runGitCommandOrThrow(context.primaryWorktree, ['rev-parse', `${entry.head}^{tree}`], 'Failed to read the worktree head')).stdout.trim(),
   })
   : await writeWorktreeSnapshot(worktreeDirectory, { ref, message, oldValue: '' });
  let owner;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    ? await commitSnapshot(context.primaryWorktree, {
      ref,
      message,
      oldValue: '',
      head: entry.head,
      tree: (await runGitCommandOrThrow(context.primaryWorktree, ['rev-parse', `${entry.head}^{tree}`], 'Failed to read the worktree head')).stdout.trim(),
    })
    : await writeWorktreeSnapshot(worktreeDirectory, { ref, message, oldValue: '' });
=======
    ? await commitSnapshot(context.primaryWorktree, {
      ref,
      message,
      oldValue: '',
      head: entry.head ?? '',
      tree: (await runGitCommandOrThrow(context.primaryWorktree, ['rev-parse', `${entry.head}^{tree}`], 'Failed to read the worktree head')).stdout.trim(),
    })
    : await writeWorktreeSnapshot(worktreeDirectory, { ref, message, oldValue: '' });
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  try {
   const branchResult = branch ? await runGitCommand(context.primaryWorktree, ['rev-parse', '--verify', `refs/heads/${branch}`]) : null;
   if (branch && !branchResult.success) throw new Error('Could not resolve the archive branch');
   owner = await archiveSessions.captureWorktreeArchive({
    projectDirectory: directory, worktreeDirectory: targetCanonical, archiveId: id,
    archiveRef: ref, snapshotCommit: snapshot.commit, claimId: leaseId,
    branchName: branch, branchOid: branchResult?.stdout?.trim() || null, archivedAt: record.archivedAt,
   });
   await archiveSessions.prepareWorktreeArchiveRemoval(owner);
   await removeWorktree(directory, { directory: worktreeDirectory, deleteLocalBranch: false }, { bootstrapStore });
  } catch (error) {
<<<<<<< HEAD:packages/web/server/lib/git/service.js
   owner ??= error?.worktreeArchiveOwner;
   const snapshotTree = (await runGitCommand(context.primaryWorktree, ['rev-parse', `${snapshot.commit}^{tree}`])).stdout?.trim();
   const intact = await checkPathExists(worktreeDirectory)
    && await findRegisteredWorktree(context.primaryWorktree, targetCanonical)
    && (await readWorktreeStateTree(worktreeDirectory).catch(() => null))?.tree === snapshotTree;
   if (owner && !error?.worktreeArchiveOwner) await archiveSessions.rollbackWorktreeArchive(owner, !intact);
   if (intact) {
    const removed = await runGitCommand(context.primaryWorktree, ['update-ref', '-d', ref, snapshot.commit]);
    if (removed.success && owner) await archiveSessions.discardWorktreeArchive(owner);
    throw error;
   }
   throw worktreeArchiveError(
    `The worktree folder could not be removed completely (${error instanceof Error ? error.message : String(error)}). It is archived; restore it once nothing holds the folder.`,
    'WORKTREE_ARCHIVE_PARTIAL', 409,
   );
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    // `git worktree remove --force` deletes files before it gives up on a
    // busy one, so the archive goes only when the worktree is provably whole:
    // still registered, on disk, and in the very state the snapshot holds.
    const snapshotTree = (await runGitCommand(context.primaryWorktree, ['rev-parse', `${snapshot.commit}^{tree}`])).stdout?.trim();
    const intact = await checkPathExists(worktreeDirectory)
      && await findRegisteredWorktree(context.primaryWorktree, targetCanonical)
      && (await readWorktreeStateTree(worktreeDirectory).catch(() => null))?.tree === snapshotTree;
    if (intact) {
      await runGitCommand(context.primaryWorktree, ['update-ref', '-d', ref, snapshot.commit]);
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw worktreeArchiveError(
      reason === WORKTREE_BUSY_MESSAGE
        ? `The worktree folder could not be removed completely (${reason}). It is archived; restore it once nothing holds the folder.`
        : `The worktree is archived, but its folder ${worktreeDirectory} could not be deleted completely: ${reason}`,
      'WORKTREE_ARCHIVE_PARTIAL',
    );
=======
    const snapshotTree = (await runGitCommand(context.primaryWorktree, ['rev-parse', `${snapshot.commit}^{tree}`])).stdout?.trim();
    const intact = await checkPathExists(worktreeDirectory)
      && await findRegisteredWorktree(context.primaryWorktree, targetCanonical)
      && (await readWorktreeStateTree(worktreeDirectory).catch(() => null))?.tree === snapshotTree;
    if (intact) {
      await runGitCommand(context.primaryWorktree, ['update-ref', '-d', ref, snapshot.commit]);
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw worktreeArchiveError(
      reason === WORKTREE_BUSY_MESSAGE
        ? `The worktree folder could not be removed completely (${reason}). It is archived; restore it once nothing holds the folder.`
        : `The worktree is archived, but its folder ${worktreeDirectory} could not be deleted completely: ${reason}`,
      'WORKTREE_ARCHIVE_PARTIAL',
    );
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  const binding = await archiveSessions.finishWorktreeArchive(owner);
  const boundSet = new Set((binding.sessions || []).map((s) => typeof s === 'string' ? s : s.sessionId));
  return {
   id, ref, commit: snapshot.commit, head: snapshot.head, ...record, branchExists: Boolean(branch),
   sessionIds: record.sessionIds.filter((id) => boundSet.has(id)),
   sessionBinding: { status: binding.sessions.length ? 'bound' : 'verified-empty', phase: binding.phase }
  };
 } catch (error) {
  // A duplicate lease id names a lease this archive never created; releasing
  // it would end someone else's hold.
  if (error?.releaseNotNeeded === true) releaseLease = false;
  throw error;
 } finally {
  if (releaseLease && worktreeWorkers) await worktreeWorkers.release(leaseId).catch(() => undefined);
  worktreeArchivesInFlight.delete(targetCanonical);
 }
}

const findRegisteredWorktree = async (primaryWorktree, targetCanonical) => {
 const entries = await listWorktreeEntries(primaryWorktree);
 const registered = await Promise.all(entries.map(async (entry) => (entry?.worktree ? canonicalPath(entry.worktree) : null)));
 return entries[registered.indexOf(targetCanonical)] ?? null;
};

const archiveRegisteredWorktree = async ({ directory, id, worktreeDirectory, targetCanonical, context, input, options }) => {
 // Only a checkout git registers here: the removal below would otherwise
 // treat the folder as a leftover and delete it without a trace in git.
 const entry = await findRegisteredWorktree(context.primaryWorktree, targetCanonical);
 if (!entry) throw new Error('Not a worktree of this repository');
 // A new worktree's files land in the background: a snapshot taken before
 // they do records every missing file as deleted. A failure while fetching
 // submodules or LFS objects comes after every file landed, so that worktree
 // archives like any other.
 await waitForActiveWorktreeBootstrap(worktreeDirectory);
 const bootstrap = worktreeBootstrapState.get(await toCanonicalBootstrapStateKey(worktreeDirectory));
 if (bootstrap?.status === WORKTREE_BOOTSTRAP_FAILED && !bootstrap.hydration) {
  throw new Error('The worktree did not finish setting up, so it cannot be archived. Delete it instead.');
 }
 const branch = entry.branch ?? '';
 // The task title; without one, the name the sidebar showed for the work.
 const title = (branch ? toTaskTitle(await readGitConfigValue(context.primaryWorktree, `branch.${branch}.description`)) : '')
  || toTaskTitle(z.string().catch('').parse(input?.title));
 const record = {
  path: worktreeDirectory,
  branch,
  title,
  archivedAt: Date.now(),
  sessionIds: sessionIdListSchema.parse(input?.sessionIds),
 };
 const ref = `${WORKTREE_ARCHIVE_REF_PREFIX}${id}`;
 const message = `${WORKTREE_ARCHIVE_SUBJECT}\n\n${JSON.stringify(record)}`;
 // A folder deleted outside the app leaves nothing to record, so the snapshot
 // equals the commit it stood on. Git also reports a folder that only lost its
 // `.git` file as prunable; its files are still there, so that one must fail.
 const folderGone = entry.prunable === true && !(await checkPathExists(worktreeDirectory));
 const snapshot = folderGone
  ? await commitSnapshot(context.primaryWorktree, {
   ref,
   message,
   oldValue: '',
   head: entry.head,
   tree: (await runGitCommandOrThrow(context.primaryWorktree, ['rev-parse', `${entry.head}^{tree}`], 'Failed to read the worktree head')).stdout.trim(),
  })
  : await writeWorktreeSnapshot(worktreeDirectory, { ref, message, oldValue: '' });
 try {
  await removeWorktree(directory, {
   directory: worktreeDirectory,
   deleteLocalBranch: false,
   disposeInstance: input?.disposeInstance,
  }, options);
 } catch (error) {
  // `git worktree remove --force` deletes files before it gives up on a
  // busy one, so the archive goes only when the worktree is provably whole:
  // still registered, on disk, and in the very state the snapshot holds.
  const snapshotTree = (await runGitCommand(context.primaryWorktree, ['rev-parse', `${snapshot.commit}^{tree}`])).stdout?.trim();
  const intact = await checkPathExists(worktreeDirectory)
   && await findRegisteredWorktree(context.primaryWorktree, targetCanonical)
   && (await readWorktreeStateTree(worktreeDirectory).catch(() => null))?.tree === snapshotTree;
  if (intact) {
   await runGitCommand(context.primaryWorktree, ['update-ref', '-d', ref, snapshot.commit]);
   throw error;
  }
  const reason = error instanceof Error ? error.message : String(error);
  throw worktreeArchiveError(
   reason === WORKTREE_BUSY_MESSAGE
    ? `The worktree folder could not be removed completely (${reason}). It is archived; restore it once nothing holds the folder.`
    : `The worktree is archived, but its folder ${worktreeDirectory} could not be deleted completely: ${reason}`,
   'WORKTREE_ARCHIVE_PARTIAL',
  );
 }
 return { id, ref, commit: snapshot.commit, head: snapshot.head, ...record, branchExists: Boolean(branch) };
};

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Puts an archive's changes back into the worktree at `directory`, which the
 * caller created on the archive's branch (or, when that branch is gone, on the
 * archive's head commit). The changes are applied on top of whatever the
 * branch holds now and left uncommitted, then the archive is deleted. A
 * conflict leaves git's conflict state, which holds both sides. When git
 * refuses to apply anything, the archive is kept and the call fails.
 */
const prospectiveWorktreeRestore = async (directory, archive, before) => {
 const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'openchamber-restore-'));
 const checkout = path.join(temporary, 'checkout');
 let linked = false;
 try {
  const env = await buildGitEnv(directory);
  const flags = await execFileAsync(getGitBinary(), ['ls-files', '-v', '-z'], { cwd: directory, env, encoding: 'buffer', windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
  if (flags.stdout.toString('utf8').split('\0').some((entry) => entry && entry[0] !== 'H'))
   throw worktreeArchiveError('The restore target has unsupported sparse or index state. The archive is kept.', 'WORKTREE_ARCHIVE_RESTORE_RECOVERY_REQUIRED', 409);
  await runGitCommandOrThrow(directory, ['worktree', 'add', '--detach', checkout, before.head], 'Failed to create restore comparison checkout');
  linked = true;
  for (const entry of await fsp.readdir(checkout)) {
   if (entry !== '.git') await fsp.rm(path.join(checkout, entry), { recursive: true, force: true });
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Puts an archive's changes back into the worktree at `directory`, which the
 * caller created on the archive's branch (or, when that branch is gone, on the
 * archive's head commit). The changes are applied on top of whatever the
 * branch holds now and left uncommitted, then the archive is deleted. A
 * conflict leaves git's conflict state, which holds both sides. When git
 * refuses to apply anything, the archive is kept and the call fails.
 */
export async function restoreWorktreeArchive(directory, input = {}) {
  const worktreeDirectory = normalizeDirectoryPath(directory);
  if (!worktreeDirectory) throw new Error('Worktree directory is required');
  const context = await resolveWorktreeProjectContext(worktreeDirectory, { tolerateWorktreeRootConfigError: true });
  const archive = await readWorktreeArchive(context.primaryWorktree, input?.id);
  // A new worktree's files and setup commands land in the background after
  // creation answers; changes applied meanwhile would race the checkout.
  await waitForActiveWorktreeBootstrap(worktreeDirectory);
  const bootstrap = worktreeBootstrapState.get(await toCanonicalBootstrapStateKey(worktreeDirectory));
  if (bootstrap?.status === WORKTREE_BOOTSTRAP_FAILED) {
    throw new Error('The worktree did not finish setting up, so its archived changes were not applied. The archive is kept.');
=======
export async function restoreWorktreeArchive(directory: string, input: { id?: unknown } = {}) {
  const worktreeDirectory = normalizeDirectoryPath(directory);
  if (!worktreeDirectory) throw new Error('Worktree directory is required');
  const context = await resolveWorktreeProjectContext(worktreeDirectory, { tolerateWorktreeRootConfigError: true });
  const archive = await readWorktreeArchive(context.primaryWorktree, input?.id);
  await waitForActiveWorktreeBootstrap(worktreeDirectory);
  const bootstrap = worktreeBootstrapState.get(await toCanonicalBootstrapStateKey(worktreeDirectory));
  if (bootstrap?.status === WORKTREE_BOOTSTRAP_FAILED) {
    throw new Error('The worktree did not finish setting up, so its archived changes were not applied. The archive is kept.');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
  for (const entry of await fsp.readdir(directory)) {
   if (entry !== '.git') await fsp.cp(path.join(directory, entry), path.join(checkout, entry), { recursive: true, dereference: false, preserveTimestamps: true });
||||||| bc50ba56aa:packages/web/server/lib/git/service.js

  const trees = await runGitCommandOrThrow(worktreeDirectory, ['rev-parse', `${archive.commit}^{tree}`, `${archive.head}^{tree}`], 'Failed to read the worktree archive');
  const [snapshotTree, headTree] = String(trees.stdout || '').trim().split('\n');
  let conflicts = false;
  if (snapshotTree !== headTree) {
    const env = { ...(await buildGitEnv(worktreeDirectory)), ...SNAPSHOT_IDENTITY_ENV };
    const applied = await runGitCommand(worktreeDirectory, ['cherry-pick', '--no-commit', archive.commit], { env });
    if (applied.success) {
      // The changes were uncommitted when archived; staging them was only the
      // means of applying them.
      await runGitCommandOrThrow(worktreeDirectory, ['reset', '--quiet'], 'Failed to unstage the restored changes');
    } else {
      // A conflict leaves unmerged entries; a refusal (files the setup
      // commands wrote would be overwritten) applies nothing at all.
      const unmerged = await runGitCommand(worktreeDirectory, ['ls-files', '--unmerged']);
      if (!unmerged.success || !String(unmerged.stdout || '').trim()) {
        throw worktreeArchiveError(
          `The archived changes could not be applied (${applied.message || 'git refused'}). The archive is kept.`,
          'WORKTREE_ARCHIVE_NOT_APPLIED',
        );
      }
      conflicts = true;
    }
=======

  const trees = await runGitCommandOrThrow(worktreeDirectory, ['rev-parse', `${archive.commit}^{tree}`, `${archive.head}^{tree}`], 'Failed to read the worktree archive');
  const [snapshotTree, headTree] = String(trees.stdout || '').trim().split('\n');
  let conflicts = false;
  if (snapshotTree !== headTree) {
    const env = { ...(await buildGitEnv(worktreeDirectory)), ...SNAPSHOT_IDENTITY_ENV };
    const applied = await runGitCommand(worktreeDirectory, ['cherry-pick', '--no-commit', archive.commit], { env });
    if (applied.success) {
      await runGitCommandOrThrow(worktreeDirectory, ['reset', '--quiet'], 'Failed to unstage the restored changes');
    } else {
      const unmerged = await runGitCommand(worktreeDirectory, ['ls-files', '--unmerged']);
      if (!unmerged.success || !String(unmerged.stdout || '').trim()) {
        throw worktreeArchiveError(
          `The archived changes could not be applied (${applied.message || 'git refused'}). The archive is kept.`,
          'WORKTREE_ARCHIVE_NOT_APPLIED',
        );
      }
      conflicts = true;
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
  const indexPath = async (cwd) => {
   const result = await runGitCommandOrThrow(cwd, ['rev-parse', '--git-path', 'index'], 'Failed to resolve restore index');
   return path.resolve(cwd, result.stdout.trim());
  };
  await fsp.copyFile(await indexPath(directory), await indexPath(checkout));
  const reconstructed = await fingerprintWorktreeRestore(checkout);
  if (JSON.stringify(reconstructed) !== JSON.stringify(before))
   throw worktreeArchiveError('The restore target could not be reproduced safely. The archive is kept.', 'WORKTREE_ARCHIVE_RESTORE_RECOVERY_REQUIRED', 409);
  const conflicts = await applyWorktreeArchiveSnapshot(checkout, archive);
  const expected = await fingerprintWorktreeRestore(checkout);
  if (expected.conflicts !== conflicts) throw new Error('Restore comparison conflict state changed');
  return expected;
 } finally {
  if (linked) {
   await runGitCommand(directory, ['worktree', 'remove', '--force', checkout]).catch(() => undefined);
   await runGitCommand(directory, ['worktree', 'prune']).catch(() => undefined);
  }
  await fsp.rm(temporary, { recursive: true, force: true });
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  // Once applied, conflicts included, the checkout holds the changes (git's
  // conflict state carries both sides), so the archive goes: kept, it would
  // still claim the sessions that are back at work.
  await runGitCommand(context.primaryWorktree, ['update-ref', '-d', archive.ref, archive.commit]);
  await publishWorktreeTopologyChange(context.primaryWorktree);
  return { id: archive.id, conflicts };
=======
  await runGitCommand(context.primaryWorktree, ['update-ref', '-d', archive.ref, archive.commit]);
  await publishWorktreeTopologyChange(context.primaryWorktree);
  return { id: archive.id, conflicts };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function restoreWorktreeArchive(directory, input = {}, { archiveSessions } = {}) {
 const archiveId = assertWorktreeArchiveId(input?.id);
 let worktreeDirectory = normalizeDirectoryPath(directory);
 if (!worktreeDirectory) throw worktreeArchiveError('Worktree directory is required', undefined, 400);
 const context = await resolveWorktreeArchiveProjectContext(worktreeDirectory);
 if (!archiveSessions?.prepareWorktreeArchiveRestore) throw worktreeArchiveError('Host archive authority is unavailable', 'WORKTREE_ARCHIVE_AUTHORITY_UNAVAILABLE', 503);
 const resume = input?.recovery?.mode === 'same_target';
 if (resume) {
  if (!Number.isSafeInteger(input.recovery.revision) || input.recovery.revision <= 0 || !archiveSessions.resolveWorktreeArchivePinnedTarget)
   throw worktreeArchiveError('Restore revision is invalid', 'WORKTREE_ARCHIVE_TARGET_CHANGED', 409);
  worktreeDirectory = await archiveSessions.resolveWorktreeArchivePinnedTarget({ projectDirectory: context.primaryWorktree, archiveId, revision: input.recovery.revision });
 }
 const targetDirectory = await fsp.realpath(worktreeDirectory);
 const owner = await archiveSessions.prepareWorktreeArchiveRestore({ projectDirectory: context.primaryWorktree, targetDirectory, archiveId, recovery: resume ? undefined : input?.recovery, expectedRevision: resume ? input.recovery.revision : undefined });
 let cleanup = false;
 try {
  if (owner?.binding.phase === 'finalizing') {
   if (owner.binding.sessions.some(item => item.progress !== 'restored'))
    throw worktreeArchiveError('Archive finalization is incomplete. The binding is kept.', 'WORKTREE_ARCHIVE_RESTORE_RECOVERY_REQUIRED', 409);
   const current = await runGitCommand(context.primaryWorktree, ['rev-parse', '--verify', owner.binding.archiveRef]);
   if (owner.binding.restoreCasCompleted) {
    if (current.success) throw worktreeArchiveError('Archive finalization outcome is ambiguous. The binding is kept.', 'WORKTREE_ARCHIVE_RESTORE_RECOVERY_REQUIRED', 409);
    cleanup = true;
    return { id: input.id, conflicts: JSON.parse(owner.binding.expectedFingerprint).conflicts, sessionBinding: { status: 'bound', phase: 'finalizing' } };
   }
   if (current.success && current.stdout.trim() !== owner.binding.snapshotCommit)
    throw worktreeArchiveError('Archive finalization outcome is ambiguous. The binding is kept.', 'WORKTREE_ARCHIVE_RESTORE_RECOVERY_REQUIRED', 409);
   if (!current.success)
    throw worktreeArchiveError('Archive finalization outcome is ambiguous. The binding is kept.', 'WORKTREE_ARCHIVE_RESTORE_RECOVERY_REQUIRED', 409);
   if (current.success) {
    owner.binding = owner.binding.restoreCasStarted
     ? owner.binding
     : await archiveSessions.markWorktreeArchiveRestoreCasStarted(owner, owner.binding.revision);
    await runGitCommandOrThrow(context.primaryWorktree, ['update-ref', '-d', owner.binding.archiveRef, owner.binding.snapshotCommit], 'Failed to delete the worktree archive');
   }
   await archiveSessions.markWorktreeArchiveRestoreCasCompleted(owner, owner.binding.revision);
   cleanup = true;
   return { id: input.id, conflicts: JSON.parse(owner.binding.expectedFingerprint).conflicts, sessionBinding: { status: 'bound', phase: 'finalizing' } };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Deletes an archive for good: its ref, and with `deleteBranch` its local
 * branch too, unless a checkout uses that branch again.
 */
export async function deleteWorktreeArchive(directory, input = {}) {
  const context = await resolveWorktreeProjectContext(directory, { tolerateWorktreeRootConfigError: true });
  const archive = await readWorktreeArchive(context.primaryWorktree, input?.id);
  await runGitCommandOrThrow(context.primaryWorktree, ['update-ref', '-d', archive.ref, archive.commit], 'Failed to delete the worktree archive');
  let branchDeleted = false;
  if (input?.deleteBranch === true && archive.branchExists) {
    const checkedOut = (await listWorktreeEntries(context.primaryWorktree))
      .some((entry) => cleanBranchName(String(entry.branchRef || entry.branch || '').trim()) === archive.branch);
    if (!checkedOut) {
      const removed = await runGitCommand(context.primaryWorktree, ['branch', '-D', archive.branch]);
      branchDeleted = removed.success;
    }
=======
export async function deleteWorktreeArchive(directory: string, input: { id?: unknown; deleteBranch?: boolean } = {}) {
  const context = await resolveWorktreeProjectContext(directory, { tolerateWorktreeRootConfigError: true });
  const archive = await readWorktreeArchive(context.primaryWorktree, input?.id);
  await runGitCommandOrThrow(context.primaryWorktree, ['update-ref', '-d', archive.ref, archive.commit], 'Failed to delete the worktree archive');
  let branchDeleted = false;
  if (input?.deleteBranch === true && archive.branchExists) {
    const checkedOut = (await listWorktreeEntries(context.primaryWorktree))
      .some((entry) => cleanBranchName(String(entry.branchRef || entry.branch || '').trim()) === archive.branch);
    if (!checkedOut) {
      const removed = await runGitCommand(context.primaryWorktree, ['branch', '-D', archive.branch]);
      branchDeleted = removed.success;
    }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  const archive = await readWorktreeArchive(context.primaryWorktree, archiveId);
  if (owner && (archive.ref !== owner.binding.archiveRef || archive.commit !== owner.binding.snapshotCommit))
   throw worktreeArchiveError('Archive ref changed', 'WORKTREE_ARCHIVE_REF_CHANGED', 409);
  await waitForActiveWorktreeBootstrap(worktreeDirectory);
  const bootstrap = worktreeBootstrapState.get(await toCanonicalBootstrapStateKey(worktreeDirectory));
  if (bootstrap?.status === WORKTREE_BOOTSTRAP_FAILED)
   throw worktreeArchiveError('The worktree did not finish setting up. The archive is kept.', 'WORKTREE_BOOTSTRAP_FAILED', 409);
  if (!owner) {
   const conflicts = await applyWorktreeArchiveSnapshot(worktreeDirectory, archive);
   await runGitCommandOrThrow(context.primaryWorktree, ['update-ref', '-d', archive.ref, archive.commit], 'Failed to delete the worktree archive');
   await publishWorktreeTopologyChange(context.primaryWorktree);
   return { id: archive.id, conflicts, sessionBinding: { status: 'unbound' } };
  }
  let binding = owner.binding;
  let current = await fingerprintWorktreeRestore(worktreeDirectory);
  if (owner.recovering) {
   const old = await fingerprintWorktreeRestore(owner.previousTargetDirectory);
   const oldPreimage = JSON.parse(binding.preapplyFingerprint);
   const oldExpected = JSON.parse(binding.expectedFingerprint);
   const oldIsPreimage = old && JSON.stringify(old) === JSON.stringify(oldPreimage);
   const oldIsExpected = old && JSON.stringify(old) === JSON.stringify(oldExpected);
   if (old && ((oldIsPreimage && !binding.applyAttempted) || (oldIsExpected && !oldIsPreimage)))
    throw worktreeArchiveError('The original restore target is not ambiguous.', 'WORKTREE_ARCHIVE_TARGET_CHANGED', 409);
   if (JSON.stringify(current) !== JSON.stringify(oldPreimage))
    throw worktreeArchiveError('The recovery checkout does not match the captured preimage.', 'WORKTREE_ARCHIVE_RESTORE_RECOVERY_REQUIRED', 409);
   const expected = await prospectiveWorktreeRestore(worktreeDirectory, archive, current);
   binding = await archiveSessions.pinWorktreeArchiveRestore(owner, { preapplyHead: current.head, preapplyFingerprint: current, expectedFingerprint: expected });
  } else if (!binding.targetWorkspaceId) {
   const expected = await prospectiveWorktreeRestore(worktreeDirectory, archive, current);
   binding = await archiveSessions.pinWorktreeArchiveRestore(owner, { preapplyHead: current.head, preapplyFingerprint: current, expectedFingerprint: expected });
  }
  // Fingerprinting and the prospective helper run before the target is pinned.
  // Re-read under the persisted fence before deciding whether an apply is safe.
  current = await fingerprintWorktreeRestore(worktreeDirectory);
  const preimage = JSON.parse(binding.preapplyFingerprint);
  const expected = JSON.parse(binding.expectedFingerprint);
  if (JSON.stringify(current) === JSON.stringify(preimage)) {
   if (binding.applyAttempted)
    throw Object.assign(worktreeArchiveError('Restore state is ambiguous. The archive is kept.', 'WORKTREE_ARCHIVE_RESTORE_RECOVERY_REQUIRED', 409), { details: { revision: binding.revision, recoveryHead: binding.preapplyHead } });
   binding = await archiveSessions.markWorktreeArchiveRestoreAttempted(owner, binding.revision);
   await applyWorktreeArchiveSnapshot(worktreeDirectory, archive);
   current = await fingerprintWorktreeRestore(worktreeDirectory);
   if (JSON.stringify(current) !== JSON.stringify(expected))
    throw worktreeArchiveError('Restore result differs from the captured result. The archive is kept.', 'WORKTREE_ARCHIVE_RESTORE_RECOVERY_REQUIRED', 409);
  } else if (JSON.stringify(current) !== JSON.stringify(expected)) {
   throw Object.assign(worktreeArchiveError('Restore state is ambiguous. The archive is kept.', 'WORKTREE_ARCHIVE_RESTORE_RECOVERY_REQUIRED', 409), { details: { revision: binding.revision, recoveryHead: binding.preapplyHead } });
  }
  binding = await archiveSessions.finishWorktreeArchiveRestore(owner);
  binding = await archiveSessions.finalizeWorktreeArchiveRestore(owner, binding.revision);
  binding = await archiveSessions.markWorktreeArchiveRestoreCasStarted(owner, binding.revision);
  await runGitCommandOrThrow(context.primaryWorktree, ['update-ref', '-d', archive.ref, archive.commit], 'Failed to delete the worktree archive');
  binding = await archiveSessions.markWorktreeArchiveRestoreCasCompleted(owner, binding.revision);
  cleanup = true;
  await publishWorktreeTopologyChange(context.primaryWorktree);
  return { id: archive.id, conflicts: expected.conflicts, sessionBinding: { status: 'bound', phase: 'finalizing' } };
 } finally {
  if (owner) {
   await archiveSessions.releaseWorktreeArchiveRestore(owner);
   if (cleanup) await archiveSessions.cleanupWorktreeArchiveRestore(owner);
  }
 }
}

const deleteArchiveRefs = async (directory, archiveRef, snapshotCommit, branchRef, branchOid) => {
 const env = await buildGitEnv(directory);
 const commands = `start\ndelete ${archiveRef} ${snapshotCommit}\n${branchRef ? `delete ${branchRef} ${branchOid}\n` : ''}prepare\ncommit\n`;
 await new Promise((resolve, reject) => {
  const child = spawn(getGitBinary(), ['update-ref', '--stdin'], { cwd: directory, env, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve() : reject(worktreeArchiveError(`Archive ref transaction failed: ${stderr.trim()}`, 'WORKTREE_ARCHIVE_REF_CHANGED', 409)));
  child.stdin.on('error', () => { });
  child.stdin.end(commands);
 });
};

export async function deleteWorktreeArchive(directory, input = {}, { archiveSessions } = {}) {
 const archiveId = assertWorktreeArchiveId(input?.id);
 const context = await resolveWorktreeArchiveProjectContext(directory);
 if (!archiveSessions?.prepareWorktreeArchiveDelete) throw worktreeArchiveError('Host archive authority is unavailable', 'WORKTREE_ARCHIVE_AUTHORITY_UNAVAILABLE', 503);
 let owner = await archiveSessions.prepareWorktreeArchiveDelete({ projectDirectory: context.primaryWorktree, archiveId });
 let cleanup = false;
 try {
  if (owner?.binding.phase === 'finalizing') {
   owner = await archiveSessions.claimWorktreeArchiveDelete(owner);
   const current = await runGitCommand(context.primaryWorktree, ['rev-parse', '--verify', owner.binding.archiveRef]);
   if (current.success || !owner.binding.deleteCasCompleted || owner.binding.sessions.some((item) => item.progress !== 'deleted'))
    throw worktreeArchiveError('Archive deletion outcome is ambiguous. The binding is kept.', 'WORKTREE_ARCHIVE_DELETE_RECOVERY_REQUIRED', 409);
   if (owner.binding.deleteBranchRequested) {
    const branchRef = `refs/heads/${owner.binding.branchName}`;
    const branch = await runGitCommand(context.primaryWorktree, ['rev-parse', '--verify', branchRef]);
    if (branch.success) throw worktreeArchiveError('Archive deletion outcome is ambiguous. The binding is kept.', 'WORKTREE_ARCHIVE_DELETE_RECOVERY_REQUIRED', 409);
   }
   cleanup = true;
   return { id: archiveId, branchDeleted: Boolean(owner.binding.deleteBranchRequested), sessionBinding: { status: 'bound' } };
  }
  const archive = await readWorktreeArchive(context.primaryWorktree, archiveId);
  if (owner && (archive.ref !== owner.binding.archiveRef || archive.commit !== owner.binding.snapshotCommit))
   throw worktreeArchiveError('Archive ref changed', 'WORKTREE_ARCHIVE_REF_CHANGED', 409);
  const branch = owner ? owner.binding.branchName : archive.branch;
  const branchOid = owner ? owner.binding.branchOid : null;
  if (input.deleteBranch === true && (!branch || (owner && !branchOid)))
   throw worktreeArchiveError('The archived branch identity is unavailable', 'WORKTREE_ARCHIVE_BRANCH_CHANGED', 409);
  const branchRef = input.deleteBranch === true && branch ? `refs/heads/${branch}` : null;
  const preflightBranch = async () => {
   if (!branchRef) return;
   const checkedOut = (await listWorktreeEntries(context.primaryWorktree)).some((entry) => cleanBranchName(String(entry.branchRef || entry.branch || '').trim()) === branch);
   if (checkedOut) throw worktreeArchiveError('The archived branch is checked out', 'WORKTREE_ARCHIVE_BRANCH_IN_USE', 409);
   const current = await runGitCommand(context.primaryWorktree, ['rev-parse', '--verify', branchRef]);
   if (!current.success || (branchOid && current.stdout.trim() !== branchOid)) throw worktreeArchiveError('The archived branch changed', 'WORKTREE_ARCHIVE_BRANCH_CHANGED', 409);
   return current.stdout.trim();
  };
  const exactBranchOid = await preflightBranch();
  if (owner) owner = await archiveSessions.claimWorktreeArchiveDelete(owner);
  let binding = owner?.binding;
  if (owner) binding = await archiveSessions.deleteWorktreeArchiveSessions(owner);
  await preflightBranch();
  if (owner) binding = await archiveSessions.finalizeWorktreeArchiveDelete(owner, binding.revision, input.deleteBranch === true);
  await deleteArchiveRefs(context.primaryWorktree, archive.ref, archive.commit, branchRef, branchOid ?? exactBranchOid);
  if (owner) binding = await archiveSessions.markWorktreeArchiveDeleteCasCompleted(owner, binding.revision);
  cleanup = Boolean(owner);
  return { id: archive.id, branchDeleted: Boolean(branchRef), sessionBinding: { status: owner ? 'bound' : 'unbound' } };
 } finally {
  if (owner?.claimId) {
   await archiveSessions.releaseWorktreeArchiveRestore(owner);
   if (cleanup) await archiveSessions.cleanupWorktreeArchiveRestore(owner);
  }
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function deleteBranch(directory, branch, options = {}) {
 const { git } = await createRepositoryGitContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function deleteBranch(directory, branch, options = {}) {
  const { git } = await createRepositoryGitContext(directory);
=======
export async function deleteBranch(directory: string, branch: string, options: { ifExists?: boolean; force?: unknown } = {}) {
  const { git } = await createRepositoryGitContext(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 try {
  const branchName = branch.startsWith('refs/heads/')
   ? branch.substring('refs/heads/'.length)
   : branch;
  if (options.ifExists) {
   const found = await runGitCommand(directory, ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], { timeoutMs: GIT_PROBE_TIMEOUT_MS });
   if (!found.success) {
    if (found.exitCode === 1 && !found.stderr.trim()) return { success: true };
    throw new Error(found.message || 'Failed to check branch before deletion');
   }
  }
  const args = ['branch', options.force ? '-D' : '-d', branchName];
  await git.raw(args);
  return { success: true };
 } catch (error) {
  console.error('Failed to delete branch:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/**
 * Resolve a log base ref using local-first semantics.
 *
 * - If `from` is falsy / whitespace → return undefined.
 * - If the local ref resolves → return it unchanged (caller's intent preserved).
 * - If the local ref is absent but `origin/<from>` exists → return `origin/<from>`
 *   (common when the user has never checked out the base branch locally).
 * - If neither resolves → return `from` unchanged so git surfaces a meaningful error.
 *
 * @param {string | undefined} from   - The raw `from` option value.
 * @param {(ref: string) => Promise<boolean>} checkRef - Returns true when the ref resolves.
 * @returns {Promise<string | undefined>}
 */
export async function resolveBaseRefForLog(from, checkRef) {
 const normalized = typeof from === 'string' ? from.trim() : undefined;
 if (!normalized) return undefined;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/**
 * Resolve a log base ref using local-first semantics.
 *
 * - If `from` is falsy / whitespace → return undefined.
 * - If the local ref resolves → return it unchanged (caller's intent preserved).
 * - If the local ref is absent but `origin/<from>` exists → return `origin/<from>`
 *   (common when the user has never checked out the base branch locally).
 * - If neither resolves → return `from` unchanged so git surfaces a meaningful error.
 *
 * @param {string | undefined} from   - The raw `from` option value.
 * @param {(ref: string) => Promise<boolean>} checkRef - Returns true when the ref resolves.
 * @returns {Promise<string | undefined>}
 */
export async function resolveBaseRefForLog(from, checkRef) {
  const normalized = typeof from === 'string' ? from.trim() : undefined;
  if (!normalized) return undefined;
=======
export async function resolveBaseRefForLog(from: string | undefined, checkRef: (ref: string) => Promise<boolean>) {
  const normalized = isPrimitiveString(from) ? from.trim() : undefined;
  if (!normalized) return undefined;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 if (await checkRef(normalized)) return normalized;

 const originRef = `refs/remotes/origin/${normalized}`;
 if (await checkRef(originRef)) return `origin/${normalized}`;

 return normalized;
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function getLog(directory, options = {}) {
 const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function getLog(directory, options = {}) {
  const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory);
=======
export async function getLog(directory: string, options: LogOptions = {}) {
  const { directoryPath, directoryGit, repoRoot, git } = await createRepositoryGitContext(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 try {
  const maxCount = options.maxCount || 50;

  if (options.all) {
   const logArgs = [
    'log',
    `--max-count=${maxCount}`,
    '--all',
    '--topo-order',
    '--date=iso',
    '--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%ad%x1f%s%x1f%D',
    '--shortstat',
   ];

   const rawLog = await git.raw(logArgs);
   const records = rawLog
    .split('\x1e')
    .map((e) => e.trim())
    .filter(Boolean);

   const entries = [];
   for (const record of records) {
    const lines = record.split('\n').filter((l) => l.trim().length > 0);
    const header = lines.shift() || '';
    const [hash, parentsRaw, author_name, author_email, date, message, refsRaw] =
     header.split('\x1f');
    if (!hash) continue;

    const parents = parentsRaw ? parentsRaw.trim().split(' ').filter(Boolean) : [];
    const refs = refsRaw ? refsRaw.trim() : '';

<<<<<<< HEAD:packages/web/server/lib/git/service.js
    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;
    for (const line of lines) {
     const filesMatch = line.match(/(\d+)\s+files?\s+changed/);
     const insertMatch = line.match(/(\d+)\s+insertions?\(\+\)/);
     const deleteMatch = line.match(/(\d+)\s+deletions?\(-\)/);
     if (filesMatch) filesChanged = parseInt(filesMatch[1], 10);
     if (insertMatch) insertions = parseInt(insertMatch[1], 10);
     if (deleteMatch) deletions = parseInt(deleteMatch[1], 10);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
        let filesChanged = 0;
        let insertions = 0;
        let deletions = 0;
        for (const line of lines) {
          const filesMatch = line.match(/(\d+)\s+files?\s+changed/);
          const insertMatch = line.match(/(\d+)\s+insertions?\(\+\)/);
          const deleteMatch = line.match(/(\d+)\s+deletions?\(-\)/);
          if (filesMatch) filesChanged = parseInt(filesMatch[1], 10);
          if (insertMatch) insertions = parseInt(insertMatch[1], 10);
          if (deleteMatch) deletions = parseInt(deleteMatch[1], 10);
        }

        entries.push({
          hash,
          date: date || '',
          message: message || '',
          refs,
          body: '',
          author_name: author_name || '',
          author_email: author_email || '',
          filesChanged,
          insertions,
          deletions,
          parents,
        });
      }

      return { all: entries, latest: entries[0] || null, total: entries.length };
=======
        let filesChanged = 0;
        let insertions = 0;
        let deletions = 0;
        for (const line of lines) {
          const filesMatch = line.match(/(\d+)\s+files?\s+changed/);
          const insertMatch = line.match(/(\d+)\s+insertions?\(\+\)/);
          const deleteMatch = line.match(/(\d+)\s+deletions?\(-\)/);
          if (filesMatch) filesChanged = parseInt(filesMatch[1] ?? '', 10);
          if (insertMatch) insertions = parseInt(insertMatch[1] ?? '', 10);
          if (deleteMatch) deletions = parseInt(deleteMatch[1] ?? '', 10);
        }

        entries.push({
          hash,
          date: date || '',
          message: message || '',
          refs,
          body: '',
          author_name: author_name || '',
          author_email: author_email || '',
          filesChanged,
          insertions,
          deletions,
          parents,
        });
      }

      return { all: entries, latest: entries[0] || null, total: entries.length };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
    entries.push({
     hash,
     date: date || '',
     message: message || '',
     refs,
     body: '',
     author_name: author_name || '',
     author_email: author_email || '',
     filesChanged,
     insertions,
     deletions,
     parents,
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    const filePath = options.file
      ? (await resolveGitFileContext(directoryPath, directoryGit, options.file, repoRoot)).repoPath
      : undefined;

    // Prefer the local ref; fall back to origin/<from> only when the local ref
    // cannot be resolved (e.g. user has never checked out the base branch).
    const checkRef = async (ref) => {
      try {
        const out = await git.raw(['rev-parse', '--verify', ref]);
        return Boolean(out && out.trim());
      } catch {
        return false;
      }
    };
    // A fresh `git init` sits on a branch with no commits yet: HEAD names a
    // branch that does not resolve. Its history is empty, not an error.
    if (!options.to && !(await checkRef('HEAD'))) {
      const unborn = await git.raw(['symbolic-ref', '-q', 'HEAD']).then(() => true, () => false);
      if (unborn) return { all: [], latest: null, total: 0 };
    }

    const resolvedFrom = await resolveBaseRefForLog(options.from, checkRef);

    if (options.to) {
      // Inspect the exit status: Git errors are localized and simple-git treats silent exit 1 as success.
      const probe = await runGitCommand(repoRoot, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${options.to}^{commit}`]);
      if (!probe.success && probe.exitCode === 1) {
        throw Object.assign(new Error(`Revision '${options.to}' not found`), { code: 'revision_not_found' });
      }
      if (!probe.success) throw new Error(probe.message || 'Failed to verify revision');
    }

    // simple-git's `to` alone means HEAD..to, which is empty for the current
    // branch. A single requested ref means its reachable history instead.
    const baseLog = options.to && !resolvedFrom
      ? await git.log([`--max-count=${maxCount}`, options.to, ...(filePath ? ['--', filePath] : [])])
      // `from..to`, the commits `to` adds; simple-git defaults to `from...to`,
      // which also lists what `from` gained since the two diverged.
      : await git.log({ maxCount, from: resolvedFrom, to: options.to, file: filePath, symmetric: false });

    const logArgs = [
      'log',
      `--max-count=${maxCount}`,
      '--date=iso',
      '--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%ad%x1f%s',
      '--shortstat'
    ];

    if (resolvedFrom && options.to) {
      logArgs.push(`${resolvedFrom}..${options.to}`);
    } else if (resolvedFrom) {
      logArgs.push(`${resolvedFrom}..HEAD`);
    } else if (options.to) {
      logArgs.push(options.to);
    }

    if (filePath) {
      logArgs.push('--', filePath);
    }

    const rawLog = await git.raw(logArgs);
    const records = rawLog
      .split('\x1e')
      .map((entry) => entry.trim())
      .filter(Boolean);

    const statsMap = new Map();

    records.forEach((record) => {
      const lines = record.split('\n').filter((line) => line.trim().length > 0);
      const header = lines.shift() || '';
      const [hash, parentsRaw] = header.split('\x1f');
      const parents = parentsRaw ? parentsRaw.trim().split(' ').filter(Boolean) : [];
      if (!hash) {
        return;
      }

      let filesChanged = 0;
      let insertions = 0;
      let deletions = 0;

      lines.forEach((line) => {
        const filesMatch = line.match(/(\d+)\s+files?\s+changed/);
        const insertMatch = line.match(/(\d+)\s+insertions?\(\+\)/);
        const deleteMatch = line.match(/(\d+)\s+deletions?\(-\)/);

        if (filesMatch) {
          filesChanged = parseInt(filesMatch[1], 10);
        }
        if (insertMatch) {
          insertions = parseInt(insertMatch[1], 10);
        }
        if (deleteMatch) {
          deletions = parseInt(deleteMatch[1], 10);
        }
      });

      statsMap.set(hash, { filesChanged, insertions, deletions, parents });
=======
    const filePath = options.file
      ? (await resolveGitFileContext(directoryPath, directoryGit, options.file, repoRoot)).repoPath
      : undefined;

    const checkRef = async (ref: string) => {
      try {
        const out = await git.raw(['rev-parse', '--verify', ref]);
        return Boolean(out && out.trim());
      } catch {
        return false;
      }
    };
    if (!options.to && !(await checkRef('HEAD'))) {
      const unborn = await git.raw(['symbolic-ref', '-q', 'HEAD']).then(() => true, () => false);
      if (unborn) return { all: [], latest: null, total: 0 };
    }

    const resolvedFrom = await resolveBaseRefForLog(options.from, checkRef);

    if (options.to) {
      const probe = await runGitCommand(repoRoot, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${options.to}^{commit}`]);
      if (!probe.success && probe.exitCode === 1) {
        throw Object.assign(new Error(`Revision '${options.to}' not found`), { code: 'revision_not_found' });
      }
      if (!probe.success) throw new Error(probe.message || 'Failed to verify revision');
    }

    const baseLog = options.to && !resolvedFrom
      ? await git.log([`--max-count=${maxCount}`, options.to, ...(filePath ? ['--', filePath] : [])])
      : await git.log({ maxCount, from: resolvedFrom, to: options.to, file: filePath, symmetric: false });

    const logArgs = [
      'log',
      `--max-count=${maxCount}`,
      '--date=iso',
      '--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%ad%x1f%s',
      '--shortstat'
    ];

    if (resolvedFrom && options.to) {
      logArgs.push(`${resolvedFrom}..${options.to}`);
    } else if (resolvedFrom) {
      logArgs.push(`${resolvedFrom}..HEAD`);
    } else if (options.to) {
      logArgs.push(options.to);
    }

    if (filePath) {
      logArgs.push('--', filePath);
    }

    const rawLog = await git.raw(logArgs);
    const records = rawLog
      .split('\x1e')
      .map((entry) => entry.trim())
      .filter(Boolean);

    const statsMap = new Map<string, DiffStats & { filesChanged: number; parents: string[] }>();

    records.forEach((record) => {
      const lines = record.split('\n').filter((line) => line.trim().length > 0);
      const header = lines.shift() || '';
      const [hash, parentsRaw] = header.split('\x1f');
      const parents = parentsRaw ? parentsRaw.trim().split(' ').filter(Boolean) : [];
      if (!hash) {
        return;
      }

      let filesChanged = 0;
      let insertions = 0;
      let deletions = 0;

      lines.forEach((line) => {
        const filesMatch = line.match(/(\d+)\s+files?\s+changed/);
        const insertMatch = line.match(/(\d+)\s+insertions?\(\+\)/);
        const deleteMatch = line.match(/(\d+)\s+deletions?\(-\)/);

        if (filesMatch) {
          filesChanged = parseInt(filesMatch[1] ?? '', 10);
        }
        if (insertMatch) {
          insertions = parseInt(insertMatch[1] ?? '', 10);
        }
        if (deleteMatch) {
          deletions = parseInt(deleteMatch[1] ?? '', 10);
        }
      });

      statsMap.set(hash, { filesChanged, insertions, deletions, parents });
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    });
   }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
   return { all: entries, latest: entries[0] || null, total: entries.length };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    const merged = baseLog.all.map((entry) => {
      const stats = statsMap.get(entry.hash) || { filesChanged: 0, insertions: 0, deletions: 0, parents: [] };
      return {
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        refs: entry.refs || '',
        body: entry.body || '',
        author_name: entry.author_name,
        author_email: entry.author_email,
        filesChanged: stats.filesChanged,
        insertions: stats.insertions,
        deletions: stats.deletions,
        parents: stats.parents || [],
      };
    });

    return {
      all: merged,
      latest: merged[0] || null,
      total: baseLog.total
    };
  } catch (error) {
    if (error?.code !== 'revision_not_found') console.error('Failed to get log:', error);
    throw error;
=======
    const merged = baseLog.all.map((entry) => {
      const stats = statsMap.get(entry.hash) || { filesChanged: 0, insertions: 0, deletions: 0, parents: [] };
      return {
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        refs: entry.refs || '',
        body: entry.body || '',
        author_name: entry.author_name,
        author_email: entry.author_email,
        filesChanged: stats.filesChanged,
        insertions: stats.insertions,
        deletions: stats.deletions,
        parents: stats.parents || [],
      };
    });

    return {
      all: merged,
      latest: merged[0] || null,
      total: baseLog.total
    };
  } catch (error) {
    if (errorField(error, 'code') !== 'revision_not_found') console.error('Failed to get log:', error);
    throw error;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

  const filePath = options.file
   ? (await resolveGitFileContext(directoryPath, directoryGit, options.file, repoRoot)).repoPath
   : undefined;

  // Prefer the local ref; fall back to origin/<from> only when the local ref
  // cannot be resolved (e.g. user has never checked out the base branch).
  const checkRef = async (ref) => {
   try {
    const out = await git.raw(['rev-parse', '--verify', ref]);
    return Boolean(out && out.trim());
   } catch {
    return false;
   }
  };
  // A fresh `git init` sits on a branch with no commits yet: HEAD names a
  // branch that does not resolve. Its history is empty, not an error.
  if (!options.to && !(await checkRef('HEAD'))) {
   const unborn = await git.raw(['symbolic-ref', '-q', 'HEAD']).then(() => true, () => false);
   if (unborn) return { all: [], latest: null, total: 0 };
  }

  const resolvedFrom = await resolveBaseRefForLog(options.from, checkRef);

  if (options.to) {
   // Inspect the exit status: Git errors are localized and simple-git treats silent exit 1 as success.
   const probe = await runGitCommand(repoRoot, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${options.to}^{commit}`]);
   if (!probe.success && probe.exitCode === 1) {
    throw Object.assign(new Error(`Revision '${options.to}' not found`), { code: 'revision_not_found' });
   }
   if (!probe.success) throw new Error(probe.message || 'Failed to verify revision');
  }

  // simple-git's `to` alone means HEAD..to, which is empty for the current
  // branch. A single requested ref means its reachable history instead.
  const baseLog = options.to && !resolvedFrom
   ? await git.log([`--max-count=${maxCount}`, options.to, ...(filePath ? ['--', filePath] : [])])
   // `from..to`, the commits `to` adds; simple-git defaults to `from...to`,
   // which also lists what `from` gained since the two diverged.
   : await git.log({ maxCount, from: resolvedFrom, to: options.to, file: filePath, symmetric: false });

  const logArgs = [
   'log',
   `--max-count=${maxCount}`,
   '--date=iso',
   '--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%ad%x1f%s',
   '--shortstat'
  ];

  if (resolvedFrom && options.to) {
   logArgs.push(`${resolvedFrom}..${options.to}`);
  } else if (resolvedFrom) {
   logArgs.push(`${resolvedFrom}..HEAD`);
  } else if (options.to) {
   logArgs.push(options.to);
  }

  if (filePath) {
   logArgs.push('--', filePath);
  }

  const rawLog = await git.raw(logArgs);
  const records = rawLog
   .split('\x1e')
   .map((entry) => entry.trim())
   .filter(Boolean);

  const statsMap = new Map();

  records.forEach((record) => {
   const lines = record.split('\n').filter((line) => line.trim().length > 0);
   const header = lines.shift() || '';
   const [hash, parentsRaw] = header.split('\x1f');
   const parents = parentsRaw ? parentsRaw.trim().split(' ').filter(Boolean) : [];
   if (!hash) {
    return;
   }

   let filesChanged = 0;
   let insertions = 0;
   let deletions = 0;

   lines.forEach((line) => {
    const filesMatch = line.match(/(\d+)\s+files?\s+changed/);
    const insertMatch = line.match(/(\d+)\s+insertions?\(\+\)/);
    const deleteMatch = line.match(/(\d+)\s+deletions?\(-\)/);

    if (filesMatch) {
     filesChanged = parseInt(filesMatch[1], 10);
    }
    if (insertMatch) {
     insertions = parseInt(insertMatch[1], 10);
    }
    if (deleteMatch) {
     deletions = parseInt(deleteMatch[1], 10);
    }
   });

   statsMap.set(hash, { filesChanged, insertions, deletions, parents });
  });

  const merged = baseLog.all.map((entry) => {
   const stats = statsMap.get(entry.hash) || { filesChanged: 0, insertions: 0, deletions: 0, parents: [] };
   return {
    hash: entry.hash,
    date: entry.date,
    message: entry.message,
    refs: entry.refs || '',
    body: entry.body || '',
    author_name: entry.author_name,
    author_email: entry.author_email,
    filesChanged: stats.filesChanged,
    insertions: stats.insertions,
    deletions: stats.deletions,
    parents: stats.parents || [],
   };
  });

  return {
   all: merged,
   latest: merged[0] || null,
   total: baseLog.total
  };
 } catch (error) {
  if (error?.code !== 'revision_not_found') console.error('Failed to get log:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function isLinkedWorktree(directory) {
 const git = await createGit(directory);
 try {
  const [gitDir, gitCommonDir] = await Promise.all([
   git.raw(['rev-parse', '--git-dir']).then((output) => output.trim()),
   git.raw(['rev-parse', '--git-common-dir']).then((output) => output.trim())
  ]);
  return gitDir !== gitCommonDir;
 } catch (error) {
  console.error('Failed to determine worktree type:', error);
  return false;
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function isLinkedWorktree(directory) {
  const git = await createGit(directory);
  try {
    const [gitDir, gitCommonDir] = await Promise.all([
      git.raw(['rev-parse', '--git-dir']).then((output) => output.trim()),
      git.raw(['rev-parse', '--git-common-dir']).then((output) => output.trim())
    ]);
    return gitDir !== gitCommonDir;
  } catch (error) {
    console.error('Failed to determine worktree type:', error);
    return false;
  }
=======
export async function isLinkedWorktree(directory: string) {
  const git = await createGit(directory);
  try {
    const [gitDir, gitCommonDir] = await Promise.all([
      git.raw(['rev-parse', '--git-dir']).then((output) => output.trim()),
      git.raw(['rev-parse', '--git-common-dir']).then((output) => output.trim())
    ]);
    return gitDir !== gitCommonDir;
  } catch (error) {
    console.error('Failed to determine worktree type:', error);
    return false;
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function validateWorktreeDirectory(directory, worktreeRoot) {
 const directoryPath = normalizeDirectoryPath(directory);
 const rootPath = normalizeDirectoryPath(worktreeRoot);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function validateWorktreeDirectory(directory, worktreeRoot) {
  const directoryPath = normalizeDirectoryPath(directory);
  const rootPath = normalizeDirectoryPath(worktreeRoot);

  if (!directoryPath || !rootPath) {
    return {
      valid: false,
      insideWorktreeRoot: false,
      resolvedWorktreeRoot: null,
      resolvedCwd: null,
    };
  }

  const isRepo = await isGitRepository(directoryPath);
  if (!isRepo) {
    return {
      valid: false,
      insideWorktreeRoot: false,
      resolvedWorktreeRoot: null,
      resolvedCwd: null,
    };
  }

  const resolvedCwd = await canonicalPath(directoryPath);
  const resolvedRoot = await canonicalPath(rootPath);

  const inside = resolvedCwd.startsWith(resolvedRoot + path.sep) || resolvedCwd === resolvedRoot;
=======
export async function validateWorktreeDirectory(directory: string, worktreeRoot: string) {
  const directoryPath = normalizeDirectoryPath(directory);
  const rootPath = normalizeDirectoryPath(worktreeRoot);

  if (!directoryPath || !rootPath) {
    return {
      valid: false,
      insideWorktreeRoot: false,
      resolvedWorktreeRoot: null,
      resolvedCwd: null,
    };
  }

  const isRepo = await isGitRepository(directoryPath);
  if (!isRepo) {
    return {
      valid: false,
      insideWorktreeRoot: false,
      resolvedWorktreeRoot: null,
      resolvedCwd: null,
    };
  }

  const resolvedCwd = await canonicalPath(directoryPath);
  const resolvedRoot = await canonicalPath(rootPath);

  const inside = resolvedCwd.startsWith(resolvedRoot + path.sep) || resolvedCwd === resolvedRoot;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 if (!directoryPath || !rootPath) {
  return {
   valid: false,
   insideWorktreeRoot: false,
   resolvedWorktreeRoot: null,
   resolvedCwd: null,
  };
 }

 const isRepo = await isGitRepository(directoryPath);
 if (!isRepo) {
  return {
   valid: false,
   insideWorktreeRoot: false,
   resolvedWorktreeRoot: null,
   resolvedCwd: null,
  };
 }

 const resolvedCwd = await canonicalPath(directoryPath);
 const resolvedRoot = await canonicalPath(rootPath);

 const inside = resolvedCwd.startsWith(resolvedRoot + path.sep) || resolvedCwd === resolvedRoot;

 return {
  valid: true,
  insideWorktreeRoot: inside,
  resolvedWorktreeRoot: resolvedRoot,
  resolvedCwd,
 };
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function canonicalizeWorktreeState(directory) {
 const directoryPath = normalizeDirectoryPath(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function canonicalizeWorktreeState(directory) {
  const directoryPath = normalizeDirectoryPath(directory);
=======
export async function canonicalizeWorktreeState(directory: string) {
  const directoryPath = normalizeDirectoryPath(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 if (!directoryPath) {
  return {
   worktreeRoot: null,
   cwd: null,
   branch: null,
   headState: 'detached',
   worktreeStatus: 'not-a-repo',
   legacy: false,
   degraded: false,
   attentionReason: null,
  };
 }

 const isRepo = await isGitRepository(directoryPath);
 if (!isRepo) {
  return {
   worktreeRoot: null,
   cwd: null,
   branch: null,
   headState: 'detached',
   worktreeStatus: 'not-a-repo',
   legacy: false,
   degraded: false,
   attentionReason: null,
  };
 }

 const cwd = await canonicalPath(directoryPath);
 const git = await createGit(directoryPath);
 const repoRoot = await resolveGitRepositoryRoot(directoryPath, git).catch(() => directoryPath);

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 let worktreeRoot = null;
 let worktreeStatus = 'ready';
 let headState = /** @type {'branch' | 'detached' | 'unborn'} */ ('branch');
 let branch = null;
 let attentionReason = /** @type {'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect' | null} */ (null);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  let worktreeRoot = null;
  let worktreeStatus = 'ready';
  let headState = /** @type {'branch' | 'detached' | 'unborn'} */ ('branch');
  let branch = null;
  let attentionReason = /** @type {'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect' | null} */ (null);
=======
  let worktreeRoot = null;
  let worktreeStatus = 'ready';
  let headState: 'branch' | 'detached' | 'unborn' = 'branch';
  let branch = null;
  let attentionReason: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect' | null = null;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 try {
  const context = await resolveWorktreeProjectContext(directoryPath, { tolerateWorktreeRootConfigError: true });
  worktreeRoot = await canonicalPath(context.worktreeRoot);
 } catch {
  worktreeStatus = 'invalid';
 }

 try {
  const symbolicRef = await git.raw(['symbolic-ref', '-q', 'HEAD']).catch(() => '');
  if (symbolicRef.trim()) {
   headState = 'branch';
   branch = cleanBranchName(symbolicRef.trim());
  } else {
   const revParse = await git.raw(['rev-parse', 'HEAD']).catch(() => '');
   if (!revParse.trim()) {
    headState = 'unborn';
    branch = null;
   } else {
    headState = 'detached';
    branch = revParse.trim().slice(0, 7);
   }
  }
 } catch {
  headState = 'unborn';
  branch = null;
 }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 // Detect attention reasons from getStatus side-effects
 try {
  const status = await git.status(['-unormal']);
  if (status.current && (await git.raw(['rev-parse', '--verify', 'MERGE_HEAD']).then(() => true).catch(() => false))) {
   attentionReason = 'merge';
  } else {
   const rebaseMergePath = await resolveGitInternalPath(repoRoot, git, 'rebase-merge').catch(() => '');
   const rebaseApplyPath = await resolveGitInternalPath(repoRoot, git, 'rebase-apply').catch(() => '');
   const rebaseMerge = rebaseMergePath ? await fsp.stat(rebaseMergePath).then(() => true).catch(() => false) : false;
   const rebaseApply = rebaseApplyPath ? await fsp.stat(rebaseApplyPath).then(() => true).catch(() => false) : false;
   if (rebaseMerge || rebaseApply) {
    attentionReason = 'rebase';
   } else if (status.conflicted && status.conflicted.length > 0) {
    const cherryPickHeadPath = await resolveGitInternalPath(repoRoot, git, 'CHERRY_PICK_HEAD').catch(() => '');
    const revertHeadPath = await resolveGitInternalPath(repoRoot, git, 'REVERT_HEAD').catch(() => '');
    const cherryPickHead = cherryPickHeadPath ? await fsp.stat(cherryPickHeadPath).then(() => true).catch(() => false) : false;
    const revertHead = revertHeadPath ? await fsp.stat(revertHeadPath).then(() => true).catch(() => false) : false;
    if (cherryPickHead) attentionReason = 'cherry-pick';
    else if (revertHead) attentionReason = 'revert';
   }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  // Detect attention reasons from getStatus side-effects
  try {
    const status = await git.status(['-unormal']);
    if (status.current && (await git.raw(['rev-parse', '--verify', 'MERGE_HEAD']).then(() => true).catch(() => false))) {
      attentionReason = 'merge';
    } else {
      const rebaseMergePath = await resolveGitInternalPath(repoRoot, git, 'rebase-merge').catch(() => '');
      const rebaseApplyPath = await resolveGitInternalPath(repoRoot, git, 'rebase-apply').catch(() => '');
      const rebaseMerge = rebaseMergePath ? await fsp.stat(rebaseMergePath).then(() => true).catch(() => false) : false;
      const rebaseApply = rebaseApplyPath ? await fsp.stat(rebaseApplyPath).then(() => true).catch(() => false) : false;
      if (rebaseMerge || rebaseApply) {
        attentionReason = 'rebase';
      } else if (status.conflicted && status.conflicted.length > 0) {
        const cherryPickHeadPath = await resolveGitInternalPath(repoRoot, git, 'CHERRY_PICK_HEAD').catch(() => '');
        const revertHeadPath = await resolveGitInternalPath(repoRoot, git, 'REVERT_HEAD').catch(() => '');
        const cherryPickHead = cherryPickHeadPath ? await fsp.stat(cherryPickHeadPath).then(() => true).catch(() => false) : false;
        const revertHead = revertHeadPath ? await fsp.stat(revertHeadPath).then(() => true).catch(() => false) : false;
        if (cherryPickHead) attentionReason = 'cherry-pick';
        else if (revertHead) attentionReason = 'revert';
      }
    }
  } catch {
    // Status check failed — ignore
=======
  try {
    const status = await git.status(['-unormal']);
    if (status.current && (await git.raw(['rev-parse', '--verify', 'MERGE_HEAD']).then(() => true).catch(() => false))) {
      attentionReason = 'merge';
    } else {
      const rebaseMergePath = await resolveGitInternalPath(repoRoot, git, 'rebase-merge').catch(() => '');
      const rebaseApplyPath = await resolveGitInternalPath(repoRoot, git, 'rebase-apply').catch(() => '');
      const rebaseMerge = rebaseMergePath ? await fsp.stat(rebaseMergePath).then(() => true).catch(() => false) : false;
      const rebaseApply = rebaseApplyPath ? await fsp.stat(rebaseApplyPath).then(() => true).catch(() => false) : false;
      if (rebaseMerge || rebaseApply) {
        attentionReason = 'rebase';
      } else if (status.conflicted && status.conflicted.length > 0) {
        const cherryPickHeadPath = await resolveGitInternalPath(repoRoot, git, 'CHERRY_PICK_HEAD').catch(() => '');
        const revertHeadPath = await resolveGitInternalPath(repoRoot, git, 'REVERT_HEAD').catch(() => '');
        const cherryPickHead = cherryPickHeadPath ? await fsp.stat(cherryPickHeadPath).then(() => true).catch(() => false) : false;
        const revertHead = revertHeadPath ? await fsp.stat(revertHeadPath).then(() => true).catch(() => false) : false;
        if (cherryPickHead) attentionReason = 'cherry-pick';
        else if (revertHead) attentionReason = 'revert';
      }
    }
  } catch {
    void 0;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
 } catch {
  // Status check failed — ignore
 }

 return {
  worktreeRoot,
  cwd,
  branch,
  headState,
  worktreeStatus,
  legacy: false,
  degraded: false,
  attentionReason,
 };
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
async function resolveCommitHash(git, hash) {
 if (!/^[0-9a-f]{7,64}$/i.test(hash)) throw new Error('A commit hash is required');
 return (await git.raw(['rev-parse', '--verify', '--end-of-options', `${hash}^{commit}`])).trim();
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
async function resolveCommitHash(git, hash) {
  if (!/^[0-9a-f]{7,64}$/i.test(hash)) throw new Error('A commit hash is required');
  return (await git.raw(['rev-parse', '--verify', '--end-of-options', `${hash}^{commit}`])).trim();
=======
async function resolveCommitHash(git: SimpleGit, hash: CommitDiffOptions['hash']) {
  if (!/^[0-9a-f]{7,64}$/i.test(String(hash))) throw new Error('A commit hash is required');
  return (await git.raw(['rev-parse', '--verify', '--end-of-options', `${hash}^{commit}`])).trim();
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

const commitShowArgs = (hash: string) => ['show', '--format=', '--root', '--diff-merges=first-parent', '--find-renames', hash];

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function getCommitDiff(directory, { hash, path: filePath, previousPath, contextLines = 3 } = {}) {
 const { git } = await createRepositoryGitContext(directory);
 const commit = await resolveCommitHash(git, hash);
 const paths = [filePath, previousPath].filter(Boolean).map((value) => `:(literal)${value}`);
 return git.raw([
  ...commitShowArgs(commit), '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', `-U${Math.max(0, contextLines)}`,
  '--', ...paths,
 ]);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function getCommitDiff(directory, { hash, path: filePath, previousPath, contextLines = 3 } = {}) {
  const { git } = await createRepositoryGitContext(directory);
  const commit = await resolveCommitHash(git, hash);
  const paths = [filePath, previousPath].filter(Boolean).map((value) => `:(literal)${value}`);
  return git.raw([
    ...commitShowArgs(commit), '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', `-U${Math.max(0, contextLines)}`,
    '--', ...paths,
  ]);
=======
export async function getCommitDiff(directory: string, { hash, path: filePath, previousPath, contextLines = 3 }: CommitDiffOptions = {}) {
  const { git } = await createRepositoryGitContext(directory);
  const commit = await resolveCommitHash(git, hash);
  const paths = [filePath, previousPath].filter(Boolean).map((value) => `:(literal)${value}`);
  return git.raw([
    ...commitShowArgs(commit), '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', `-U${Math.max(0, contextLines)}`,
    '--', ...paths,
  ]);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function getCommitFiles(directory, commitHash) {
 const { git } = await createRepositoryGitContext(directory);
 const hash = await resolveCommitHash(git, commitHash);
 const [numstat, nameStatus] = await Promise.all([
  git.raw([...commitShowArgs(hash), '--numstat', '-z', '--']),
  git.raw([...commitShowArgs(hash), '--name-status', '-z', '--']),
 ]);
 const stats = new Map();
 const tokens = numstat.split('\0');
 for (let index = 0; index < tokens.length; index += 1) {
  const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(tokens[index]);
  if (!match) continue;
  let destination = match[3];
  if (!destination) {
   destination = tokens[index + 2];
   index += 2;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function getCommitFiles(directory, commitHash) {
  const { git } = await createRepositoryGitContext(directory);
  const hash = await resolveCommitHash(git, commitHash);
  const [numstat, nameStatus] = await Promise.all([
    git.raw([...commitShowArgs(hash), '--numstat', '-z', '--']),
    git.raw([...commitShowArgs(hash), '--name-status', '-z', '--']),
  ]);
  const stats = new Map();
  const tokens = numstat.split('\0');
  for (let index = 0; index < tokens.length; index += 1) {
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(tokens[index]);
    if (!match) continue;
    let destination = match[3];
    if (!destination) {
      destination = tokens[index + 2];
      index += 2;
    }
    stats.set(destination, {
      insertions: Number.parseInt(match[1], 10) || 0,
      deletions: Number.parseInt(match[2], 10) || 0,
      isBinary: match[1] === '-',
    });
=======
export async function getCommitFiles<Hash>(directory: string, commitHash: Hash) {
  const { git } = await createRepositoryGitContext(directory);
  const hash = await resolveCommitHash(git, commitHash);
  const [numstat, nameStatus] = await Promise.all([
    git.raw([...commitShowArgs(hash), '--numstat', '-z', '--']),
    git.raw([...commitShowArgs(hash), '--name-status', '-z', '--']),
  ]);
  const stats = new Map<string | undefined, DiffStats & { isBinary: boolean }>();
  const tokens = numstat.split('\0');
  for (let index = 0; index < tokens.length; index += 1) {
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(String(tokens[index]));
    if (!match) continue;
    let destination = match[3];
    if (!destination) {
      destination = tokens[index + 2];
      index += 2;
    }
    stats.set(destination, {
      insertions: Number.parseInt(match[1] ?? '', 10) || 0,
      deletions: Number.parseInt(match[2] ?? '', 10) || 0,
      isBinary: match[1] === '-',
    });
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
<<<<<<< HEAD:packages/web/server/lib/git/service.js
  stats.set(destination, {
   insertions: Number.parseInt(match[1], 10) || 0,
   deletions: Number.parseInt(match[2], 10) || 0,
   isBinary: match[1] === '-',
  });
 }
 const files = [];
 const names = nameStatus.split('\0');
 for (let index = 0; index < names.length; index += 1) {
  const changeType = names[index].charAt(0);
  if (!changeType) continue;
  const renamed = changeType === 'R' || changeType === 'C';
  const previousPath = renamed ? names[++index] : undefined;
  const filePath = names[++index];
  const fileStats = stats.get(filePath);
  if (!filePath || !fileStats) throw new Error('Incomplete commit file statistics');
  const entry = { path: filePath, ...fileStats, changeType };
  if (previousPath) entry.previousPath = previousPath;
  files.push(entry);
 }
 return { files };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const files = [];
  const names = nameStatus.split('\0');
  for (let index = 0; index < names.length; index += 1) {
    const changeType = names[index].charAt(0);
    if (!changeType) continue;
    const renamed = changeType === 'R' || changeType === 'C';
    const previousPath = renamed ? names[++index] : undefined;
    const filePath = names[++index];
    const fileStats = stats.get(filePath);
    if (!filePath || !fileStats) throw new Error('Incomplete commit file statistics');
    const entry = { path: filePath, ...fileStats, changeType };
    if (previousPath) entry.previousPath = previousPath;
    files.push(entry);
  }
  return { files };
=======
  const files = [];
  const names = nameStatus.split('\0');
  for (let index = 0; index < names.length; index += 1) {
    const changeType = names[index]?.charAt(0);
    if (!changeType) continue;
    const renamed = changeType === 'R' || changeType === 'C';
    const previousPath = renamed ? names[++index] : undefined;
    const filePath = names[++index];
    const fileStats = stats.get(filePath);
    if (!filePath || !fileStats) throw new Error('Incomplete commit file statistics');
    const entry: CommitFile = { path: filePath, ...fileStats, changeType };
    if (previousPath) entry.previousPath = previousPath;
    files.push(entry);
  }
  return { files };
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function renameBranch(directory, oldName, newName) {
 const { git, repoRoot } = await createRepositoryGitContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function renameBranch(directory, oldName, newName) {
  const { git, repoRoot } = await createRepositoryGitContext(directory);
=======
export async function renameBranch(directory: string, oldName: string, newName: string) {
  const { git, repoRoot } = await createRepositoryGitContext(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 try {
  const normalizedOldName = cleanBranchName(String(oldName || '').trim());
  const normalizedNewName = cleanBranchName(String(newName || '').trim());

  const previousRemote = await git
   .raw(['config', '--get', `branch.${normalizedOldName}.remote`])
   .then((value) => String(value || '').trim())
   .catch(() => '');
  const previousMerge = await git
   .raw(['config', '--get', `branch.${normalizedOldName}.merge`])
   .then((value) => String(value || '').trim())
   .catch(() => '');

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  // git refuses a taken name with a bare "already exists"; say where the
  // name is in use so a worktree rename that collides is understandable.
  const worktrees = await listWorktreeEntries(repoRoot).catch(() => []);
  const takenBy = worktrees.find((entry) => entry.branch === normalizedNewName);
  if (takenBy) {
   const error = new Error(`Branch ${normalizedNewName} is already checked out in ${takenBy.worktree}`);
   error.statusCode = 409;
   throw error;
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    // git refuses a taken name with a bare "already exists"; say where the
    // name is in use so a worktree rename that collides is understandable.
    const worktrees = await listWorktreeEntries(repoRoot).catch(() => []);
    const takenBy = worktrees.find((entry) => entry.branch === normalizedNewName);
    if (takenBy) {
      const error = new Error(`Branch ${normalizedNewName} is already checked out in ${takenBy.worktree}`);
      error.statusCode = 409;
      throw error;
    }
    const existing = await runGitCommand(repoRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${normalizedNewName}`]);
    if (existing.success) {
      const error = new Error(`A branch named ${normalizedNewName} already exists`);
      error.statusCode = 409;
      throw error;
    }

    await git.raw(['branch', '-m', oldName, newName]);

    // A worktree's branch lives in a file the topology watcher does not see,
    // so tell the sidebar directly when the renamed branch is checked out.
    if (worktrees.some((entry) => entry.branch === normalizedOldName)) {
      await publishWorktreeTopologyChange(repoRoot);
    }

    if (previousRemote && previousMerge && normalizedNewName) {
      const previousMergeBranch = cleanBranchName(previousMerge);
      const nextMergeBranch =
        previousMergeBranch === normalizedOldName
          ? normalizedNewName
          : previousMergeBranch;
      const upstream = normalizeUpstreamTarget(previousRemote, nextMergeBranch);

      if (upstream) {
        try {
          await runGitCommandOrThrow(
            repoRoot,
            ['branch', `--set-upstream-to=${upstream.full}`, normalizedNewName],
            `Failed to set upstream to ${upstream.full}`
          );
        } catch {
          // Leave tracking unset rather than writing config for a missing ref.
        }
      }
    }

    return { success: true, branch: newName };
  } catch (error) {
    if (error.statusCode !== 409) console.error('Failed to rename branch:', error);
    throw error;
=======
    const worktrees = await listWorktreeEntries(repoRoot).catch(() => []);
    const takenBy = worktrees.find((entry) => entry.branch === normalizedNewName);
    if (takenBy) {
      const error: Error & { statusCode?: number } = new Error(`Branch ${normalizedNewName} is already checked out in ${takenBy.worktree}`);
      error.statusCode = 409;
      throw error;
    }
    const existing = await runGitCommand(repoRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${normalizedNewName}`]);
    if (existing.success) {
      const error: Error & { statusCode?: number } = new Error(`A branch named ${normalizedNewName} already exists`);
      error.statusCode = 409;
      throw error;
    }

    await git.raw(['branch', '-m', oldName, newName]);

    if (worktrees.some((entry) => entry.branch === normalizedOldName)) {
      await publishWorktreeTopologyChange(repoRoot);
    }

    if (previousRemote && previousMerge && normalizedNewName) {
      const previousMergeBranch = cleanBranchName(previousMerge);
      const nextMergeBranch =
        previousMergeBranch === normalizedOldName
          ? normalizedNewName
          : previousMergeBranch;
      const upstream = normalizeUpstreamTarget(previousRemote, nextMergeBranch);

      if (upstream) {
        try {
          await runGitCommandOrThrow(
            repoRoot,
            ['branch', `--set-upstream-to=${upstream.full}`, normalizedNewName],
            `Failed to set upstream to ${upstream.full}`
          );
        } catch {
          void 0;
        }
      }
    }

    return { success: true, branch: newName };
  } catch (error) {
    if (errorField(error, 'statusCode') !== 409) console.error('Failed to rename branch:', error);
    throw error;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }
  const existing = await runGitCommand(repoRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${normalizedNewName}`]);
  if (existing.success) {
   const error = new Error(`A branch named ${normalizedNewName} already exists`);
   error.statusCode = 409;
   throw error;
  }

  await git.raw(['branch', '-m', oldName, newName]);

  // A worktree's branch lives in a file the topology watcher does not see,
  // so tell the sidebar directly when the renamed branch is checked out.
  if (worktrees.some((entry) => entry.branch === normalizedOldName)) {
   await publishWorktreeTopologyChange(repoRoot);
  }

  if (previousRemote && previousMerge && normalizedNewName) {
   const previousMergeBranch = cleanBranchName(previousMerge);
   const nextMergeBranch =
    previousMergeBranch === normalizedOldName
     ? normalizedNewName
     : previousMergeBranch;
   const upstream = normalizeUpstreamTarget(previousRemote, nextMergeBranch);

   if (upstream) {
    try {
     await runGitCommandOrThrow(
      repoRoot,
      ['branch', `--set-upstream-to=${upstream.full}`, normalizedNewName],
      `Failed to set upstream to ${upstream.full}`
     );
    } catch {
     // Leave tracking unset rather than writing config for a missing ref.
    }
   }
  }

  return { success: true, branch: newName };
 } catch (error) {
  if (error.statusCode !== 409) console.error('Failed to rename branch:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function getRemotes(directory) {
 const { git } = await createRepositoryGitContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function getRemotes(directory) {
  const { git } = await createRepositoryGitContext(directory);
=======
export async function getRemotes(directory: string) {
  const { git } = await createRepositoryGitContext(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 try {
  const remotes = await git.getRemotes(true);

  return remotes.map((remote) => ({
   name: remote.name,
   fetchUrl: remote.refs.fetch,
   pushUrl: remote.refs.push
  }));
 } catch (error) {
  if (isNotGitRepositoryError(error)) {
   return [];
  }
  console.error('Failed to get remotes:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function removeRemote(directory, options = {}) {
 const remoteName = String(options.remote || '').trim();
 if (!remoteName) {
  throw new Error('remote is required to remove a remote');
 }
 if (remoteName === 'origin') {
  throw new Error('Cannot remove origin remote');
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function removeRemote(directory, options = {}) {
  const remoteName = String(options.remote || '').trim();
  if (!remoteName) {
    throw new Error('remote is required to remove a remote');
  }
  if (remoteName === 'origin') {
    throw new Error('Cannot remove origin remote');
  }
=======
export async function removeRemote(directory: string, options: { remote?: string } = {}) {
  const remoteName = String(options.remote || '').trim();
  if (!remoteName) {
    throw new Error('remote is required to remove a remote');
  }
  if (remoteName === 'origin') {
    throw new Error('Cannot remove origin remote');
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const { git } = await createRepositoryGitContext(directory);

 try {
  await git.raw(['remote', 'remove', '--', remoteName]);
  return { success: true };
 } catch (error) {
  console.error('Failed to remove remote:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function rebase(directory, options = {}) {
 const { git } = await createRepositoryGitContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function rebase(directory, options = {}) {
  const { git } = await createRepositoryGitContext(directory);
=======
async function readRebaseParent(git: SimpleGit, repoRoot: string, onto: string) {
  const branch = await localBranchNameOf(repoRoot, 'HEAD');
  if (!branch) return null;
  const fullName = String(await git.raw(['rev-parse', '--symbolic-full-name', onto])).trim();
  if (fullName.startsWith('refs/heads/')) return { branch, parent: fullName.slice('refs/heads/'.length) };
  if (!fullName.startsWith('refs/remotes/') || await isOwnRemoteCopy(git, fullName, branch)) return null;
  const remoteRef = fullName.slice('refs/remotes/'.length);
  const remotes = String(await git.raw(['remote'])).split('\n').map((name) => name.trim()).filter(Boolean);
  const remote = remotes.filter((name) => remoteRef.startsWith(`${name}/`)).sort((a, b) => b.length - a.length)[0];
  return remote ? { branch, parent: remoteRef.slice(remote.length + 1) } : null;
}

const REBASE_PARENT_FILE = 'openchamber-parent.json';

async function rebaseStateDirectory(git: SimpleGit, repoRoot: string) {
  for (const name of ['rebase-merge', 'rebase-apply']) {
    const directory = await resolveGitInternalPath(repoRoot, git, name).catch(() => null);
    if (directory && await fsp.stat(directory).then(() => true, () => false)) return directory;
  }
  return null;
}

export async function rebase(directory: string, options: { onto?: string } = {}) {
  const { git, repoRoot } = await createRepositoryGitContext(directory);
  const { onto } = options;
  const parentRecord = onto ? await readRebaseParent(git, repoRoot, onto).catch(() => null) : null;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 try {
  const { onto } = options;
  if (!onto) {
   throw new Error('onto parameter is required for rebase');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  try {
    const { onto } = options;
    if (!onto) {
      throw new Error('onto parameter is required for rebase');
    }

    await git.rebase([onto]);

    return {
      success: true,
      conflict: false
    };
  } catch (error) {
    const errorMessage = String(error?.message || error || '').toLowerCase();
    const isConflict = errorMessage.includes('conflict') || 
                       errorMessage.includes('could not apply') ||
                       errorMessage.includes('merge conflict');

    if (isConflict) {
      // Get list of conflicted files
      const status = await git.status().catch(() => ({ conflicted: [] }));
      return {
        success: false,
        conflict: true,
        conflictFiles: status.conflicted || []
      };
    }

    console.error('Failed to rebase:', error);
    throw error;
=======
  try {
    if (!onto) {
      throw new Error('onto parameter is required for rebase');
    }

    await git.rebase([onto]);
    if (parentRecord) await recordBranchParent(repoRoot, parentRecord.branch, parentRecord.parent);

    return {
      success: true,
      conflict: false
    };
  } catch (error) {
    const errorMessage = String(errorField(error, 'message') || error || '').toLowerCase();
    const isConflict = errorMessage.includes('conflict') || 
                       errorMessage.includes('could not apply') ||
                       errorMessage.includes('merge conflict');

    if (isConflict) {
      const stateDirectory = parentRecord ? await rebaseStateDirectory(git, repoRoot) : null;
      if (stateDirectory) {
        await fsp.writeFile(path.join(stateDirectory, REBASE_PARENT_FILE), JSON.stringify(parentRecord)).catch(() => {});
      }
      const status = await git.status().catch(() => ({ conflicted: [] }));
      return {
        success: false,
        conflict: true,
        conflictFiles: status.conflicted || []
      };
    }

    console.error('Failed to rebase:', error);
    throw error;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

  await git.rebase([onto]);

  return {
   success: true,
   conflict: false
  };
 } catch (error) {
  const errorMessage = String(error?.message || error || '').toLowerCase();
  const isConflict = errorMessage.includes('conflict') ||
   errorMessage.includes('could not apply') ||
   errorMessage.includes('merge conflict');

  if (isConflict) {
   // Get list of conflicted files
   const status = await git.status().catch(() => ({ conflicted: [] }));
   return {
    success: false,
    conflict: true,
    conflictFiles: status.conflicted || []
   };
  }

  console.error('Failed to rebase:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function abortRebase(directory) {
 const { git } = await createRepositoryGitContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function abortRebase(directory) {
  const { git } = await createRepositoryGitContext(directory);
=======
export async function abortRebase(directory: string) {
  const { git } = await createRepositoryGitContext(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 try {
  await git.rebase(['--abort']);
  return { success: true };
 } catch (error) {
  console.error('Failed to abort rebase:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function merge(directory, options = {}) {
 const { git } = await createRepositoryGitContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function merge(directory, options = {}) {
  const { git } = await createRepositoryGitContext(directory);
=======
export async function merge(directory: string, options: { branch?: string } = {}) {
  const { git } = await createRepositoryGitContext(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 try {
  const { branch } = options;
  if (!branch) {
   throw new Error('branch parameter is required for merge');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  try {
    const { branch } = options;
    if (!branch) {
      throw new Error('branch parameter is required for merge');
    }

    await git.merge([branch]);

    return {
      success: true,
      conflict: false
    };
  } catch (error) {
    const errorMessage = String(error?.message || error || '').toLowerCase();
    const isConflict = errorMessage.includes('conflict') || 
                       errorMessage.includes('merge conflict') ||
                       errorMessage.includes('automatic merge failed');

    if (isConflict) {
      // Get list of conflicted files
      const status = await git.status().catch(() => ({ conflicted: [] }));
      return {
        success: false,
        conflict: true,
        conflictFiles: status.conflicted || []
      };
    }

    console.error('Failed to merge:', error);
    throw error;
=======
  try {
    const { branch } = options;
    if (!branch) {
      throw new Error('branch parameter is required for merge');
    }

    await git.merge([branch]);

    return {
      success: true,
      conflict: false
    };
  } catch (error) {
    const errorMessage = String(errorField(error, 'message') || error || '').toLowerCase();
    const isConflict = errorMessage.includes('conflict') || 
                       errorMessage.includes('merge conflict') ||
                       errorMessage.includes('automatic merge failed');

    if (isConflict) {
      const status = await git.status().catch(() => ({ conflicted: [] }));
      return {
        success: false,
        conflict: true,
        conflictFiles: status.conflicted || []
      };
    }

    console.error('Failed to merge:', error);
    throw error;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

  await git.merge([branch]);

  return {
   success: true,
   conflict: false
  };
 } catch (error) {
  const errorMessage = String(error?.message || error || '').toLowerCase();
  const isConflict = errorMessage.includes('conflict') ||
   errorMessage.includes('merge conflict') ||
   errorMessage.includes('automatic merge failed');

  if (isConflict) {
   // Get list of conflicted files
   const status = await git.status().catch(() => ({ conflicted: [] }));
   return {
    success: false,
    conflict: true,
    conflictFiles: status.conflicted || []
   };
  }

  console.error('Failed to merge:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function abortMerge(directory) {
 const { git } = await createRepositoryGitContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function abortMerge(directory) {
  const { git } = await createRepositoryGitContext(directory);
=======
export async function abortMerge(directory: string) {
  const { git } = await createRepositoryGitContext(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 try {
  await git.merge(['--abort']);
  return { success: true };
 } catch (error) {
  console.error('Failed to abort merge:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function continueRebase(directory) {
 const { git, repoRoot } = await createRepositoryGitContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function continueRebase(directory) {
  const { git, repoRoot } = await createRepositoryGitContext(directory);
=======
export async function continueRebase(directory: string) {
  const { git, repoRoot } = await createRepositoryGitContext(directory);
  const stateDirectory = await rebaseStateDirectory(git, repoRoot);
  const pending: unknown = stateDirectory
    ? await fsp.readFile(path.join(stateDirectory, REBASE_PARENT_FILE), 'utf8').then(JSON.parse).catch(() => null)
    : null;
  const result = await continueRebaseSteps(git, repoRoot);
  if (result.success && errorField(pending, 'branch') && errorField(pending, 'parent') && !(await rebaseStateDirectory(git, repoRoot))) {
    await recordBranchParent(repoRoot, String(errorField(pending, 'branch')), String(errorField(pending, 'parent')));
  }
  return result;
}
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 try {
  await runGitCommandWithoutEditor(repoRoot, ['rebase', '--continue']);
  return { success: true, conflict: false };
 } catch (error) {
  const errorMessage = String(error?.message || error || '').toLowerCase();

  // Check for "nothing to commit" which means rebase step is complete. Git's
  // hints for this case mention resolving conflicts, so check it first.
  if (errorMessage.includes('nothing to commit') || errorMessage.includes('no changes')) {
   // Skip this commit and continue
   try {
    await runGitCommandWithoutEditor(repoRoot, ['rebase', '--skip']);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  try {
    await runGitCommandWithoutEditor(repoRoot, ['rebase', '--continue']);
=======
async function continueRebaseSteps(git: SimpleGit, repoRoot: string) {
  try {
    await runGitCommandWithoutEditor(repoRoot, ['rebase', '--continue']);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    return { success: true, conflict: false };
<<<<<<< HEAD:packages/web/server/lib/git/service.js
   } catch {
    // Skipping applies the next commit, which can conflict too
    const status = await git.status().catch(() => ({ conflicted: [] }));
    if (status.conflicted && status.conflicted.length > 0) {
     return {
      success: false,
      conflict: true,
      conflictFiles: status.conflicted
     };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  } catch (error) {
    const errorMessage = String(error?.message || error || '').toLowerCase();

    // Check for "nothing to commit" which means rebase step is complete. Git's
    // hints for this case mention resolving conflicts, so check it first.
    if (errorMessage.includes('nothing to commit') || errorMessage.includes('no changes')) {
      // Skip this commit and continue
      try {
        await runGitCommandWithoutEditor(repoRoot, ['rebase', '--skip']);
        return { success: true, conflict: false };
      } catch {
        // Skipping applies the next commit, which can conflict too
        const status = await git.status().catch(() => ({ conflicted: [] }));
        if (status.conflicted && status.conflicted.length > 0) {
          return {
            success: false,
            conflict: true,
            conflictFiles: status.conflicted
          };
        }
        // If skip also fails, the rebase may be complete
        return { success: true, conflict: false };
      }
=======
  } catch (error) {
    const errorMessage = String(errorField(error, 'message') || error || '').toLowerCase();

    if (errorMessage.includes('nothing to commit') || errorMessage.includes('no changes')) {
      try {
        await runGitCommandWithoutEditor(repoRoot, ['rebase', '--skip']);
        return { success: true, conflict: false };
      } catch {
        const status = await git.status().catch(() => ({ conflicted: [] }));
        if (status.conflicted && status.conflicted.length > 0) {
          return {
            success: false,
            conflict: true,
            conflictFiles: status.conflicted
          };
        }
        return { success: true, conflict: false };
      }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
    }
    // If skip also fails, the rebase may be complete
    return { success: true, conflict: false };
   }
  }

  const isConflict = errorMessage.includes('conflict') ||
   errorMessage.includes('needs merge') ||
   errorMessage.includes('unmerged') ||
   errorMessage.includes('fix conflicts');

  if (isConflict) {
   const status = await git.status().catch(() => ({ conflicted: [] }));
   return {
    success: false,
    conflict: true,
    conflictFiles: status.conflicted || []
   };
  }

  console.error('Failed to continue rebase:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function continueMerge(directory) {
 const { git } = await createRepositoryGitContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function continueMerge(directory) {
  const { git } = await createRepositoryGitContext(directory);
=======
export async function continueMerge(directory: string) {
  const { git } = await createRepositoryGitContext(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 try {
  // Check if there are still unmerged files
  const status = await git.status();
  if (status.conflicted && status.conflicted.length > 0) {
   return {
    success: false,
    conflict: true,
    conflictFiles: status.conflicted
   };
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  try {
    // Check if there are still unmerged files
    const status = await git.status();
    if (status.conflicted && status.conflicted.length > 0) {
      return {
        success: false,
        conflict: true,
        conflictFiles: status.conflicted
      };
    }

    // For merge, we commit after resolving conflicts
    // Use --no-edit to use the default merge commit message
    await git.commit([], { '--no-edit': null });
    return { success: true, conflict: false };
  } catch (error) {
    const errorMessage = String(error?.message || error || '').toLowerCase();
    const isConflict = errorMessage.includes('conflict') ||
                       errorMessage.includes('needs merge') ||
                       errorMessage.includes('unmerged') ||
                       errorMessage.includes('fix conflicts');

    if (isConflict) {
      const status = await git.status().catch(() => ({ conflicted: [] }));
      return {
        success: false,
        conflict: true,
        conflictFiles: status.conflicted || []
      };
    }

    // "nothing to commit" can happen if all conflicts resolved to one side
    if (errorMessage.includes('nothing to commit') || errorMessage.includes('no changes added')) {
      // The merge is effectively complete (all changes already committed or no changes needed)
      return { success: true, conflict: false };
    }

    console.error('Failed to continue merge:', error);
    throw error;
=======
  try {
    const status = await git.status();
    if (status.conflicted && status.conflicted.length > 0) {
      return {
        success: false,
        conflict: true,
        conflictFiles: status.conflicted
      };
    }

    await git.commit([], { '--no-edit': null });
    return { success: true, conflict: false };
  } catch (error) {
    const errorMessage = String(errorField(error, 'message') || error || '').toLowerCase();
    const isConflict = errorMessage.includes('conflict') ||
                       errorMessage.includes('needs merge') ||
                       errorMessage.includes('unmerged') ||
                       errorMessage.includes('fix conflicts');

    if (isConflict) {
      const status = await git.status().catch(() => ({ conflicted: [] }));
      return {
        success: false,
        conflict: true,
        conflictFiles: status.conflicted || []
      };
    }

    if (errorMessage.includes('nothing to commit') || errorMessage.includes('no changes added')) {
      return { success: true, conflict: false };
    }

    console.error('Failed to continue merge:', error);
    throw error;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts
  }

  // For merge, we commit after resolving conflicts
  // Use --no-edit to use the default merge commit message
  await git.commit([], { '--no-edit': null });
  return { success: true, conflict: false };
 } catch (error) {
  const errorMessage = String(error?.message || error || '').toLowerCase();
  const isConflict = errorMessage.includes('conflict') ||
   errorMessage.includes('needs merge') ||
   errorMessage.includes('unmerged') ||
   errorMessage.includes('fix conflicts');

  if (isConflict) {
   const status = await git.status().catch(() => ({ conflicted: [] }));
   return {
    success: false,
    conflict: true,
    conflictFiles: status.conflicted || []
   };
  }

  // "nothing to commit" can happen if all conflicts resolved to one side
  if (errorMessage.includes('nothing to commit') || errorMessage.includes('no changes added')) {
   // The merge is effectively complete (all changes already committed or no changes needed)
   return { success: true, conflict: false };
  }

  console.error('Failed to continue merge:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
export async function getConflictDetails(directory) {
 const { repoRoot, git } = await createRepositoryGitContext(directory);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
export async function getConflictDetails(directory) {
  const { repoRoot, git } = await createRepositoryGitContext(directory);
=======
export async function getConflictDetails(directory: string) {
  const { repoRoot, git } = await createRepositoryGitContext(directory);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 try {
  // Get git status --porcelain
  const statusPorcelain = await git.raw(['status', '--porcelain']).catch(() => '');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  try {
    // Get git status --porcelain
    const statusPorcelain = await git.raw(['status', '--porcelain']).catch(() => '');
=======
  try {
    const statusPorcelain = await git.raw(['status', '--porcelain']).catch(() => '');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  // Get unmerged files
  const unmergedFilesRaw = await git.raw(['diff', '--name-only', '--diff-filter=U']).catch(() => '');
  const unmergedFiles = unmergedFilesRaw
   .split('\n')
   .map((line) => line.trim())
   .filter(Boolean);
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    // Get unmerged files
    const unmergedFilesRaw = await git.raw(['diff', '--name-only', '--diff-filter=U']).catch(() => '');
    const unmergedFiles = unmergedFilesRaw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
=======
    const unmergedFilesRaw = await git.raw(['diff', '--name-only', '--diff-filter=U']).catch(() => '');
    const unmergedFiles = unmergedFilesRaw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  // Get current diff
  const diff = await git.raw(['diff', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/']).catch(() => '');
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    // Get current diff
    const diff = await git.raw(['diff', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/']).catch(() => '');
=======
    const diff = await git.raw(['diff', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/']).catch(() => '');
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

<<<<<<< HEAD:packages/web/server/lib/git/service.js
  // simple-git resolves a quiet `rev-parse --verify` miss with empty output instead of rejecting.
  let operation = 'merge';
  let headInfo = '';
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
    // simple-git resolves a quiet `rev-parse --verify` miss with empty output instead of rejecting.
    let operation = 'merge';
    let headInfo = '';
=======
    let operation = 'merge';
    let headInfo = '';
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

  const mergeHead = (await git.raw(['rev-parse', '--verify', '--quiet', 'MERGE_HEAD']).catch(() => '')).trim();

  if (mergeHead) {
   operation = 'merge';
   const mergeMsgPath = await resolveGitInternalPath(repoRoot, git, 'MERGE_MSG').catch(() => '');
   const mergeMsg = mergeMsgPath ? await fsp.readFile(mergeMsgPath, 'utf8').catch(() => '') : '';
   headInfo = `MERGE_HEAD: ${mergeHead}\n${mergeMsg}`;
  } else {
   const rebaseHead = (await git.raw(['rev-parse', '--verify', '--quiet', 'REBASE_HEAD']).catch(() => '')).trim();

   if (rebaseHead) {
    operation = 'rebase';
    headInfo = `REBASE_HEAD: ${rebaseHead}`;
   }
  }

  return {
   statusPorcelain: statusPorcelain.trim(),
   unmergedFiles,
   diff: diff.trim(),
   headInfo: headInfo.trim(),
   operation,
  };
 } catch (error) {
  console.error('Failed to get conflict details:', error);
  throw error;
 }
}

<<<<<<< HEAD:packages/web/server/lib/git/service.js
/** @public */
export async function getCommitFileDiff(directory, hash, filePath, isBinary, previousPath) {
 if (!directory || !hash || !filePath) {
  throw new Error('directory, hash, and path are required for getCommitFileDiff');
 }
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
/** @public */
export async function getCommitFileDiff(directory, hash, filePath, isBinary, previousPath) {
  if (!directory || !hash || !filePath) {
    throw new Error('directory, hash, and path are required for getCommitFileDiff');
  }
=======
export async function getCommitFileDiff(directory: string, hash: string, filePath: string, isBinary: boolean, previousPath?: string) {
  if (!directory || !hash || !filePath) {
    throw new Error('directory, hash, and path are required for getCommitFileDiff');
  }
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 const isDocument = isOfficeDocument(filePath);
 if (isBinary && !isDocument) {
  return { original: '', modified: '', isBinary: true };
 }

<<<<<<< HEAD:packages/web/server/lib/git/service.js
 const { directoryPath, repoRoot } = await createRepositoryGitContext(directory);
 const candidates = Array.from(new Set([
  toGitPath(path.relative(repoRoot, path.resolve(repoRoot, filePath))),
  toGitPath(path.relative(repoRoot, path.resolve(directoryPath, filePath))),
 ])).filter((candidate) => candidate && !candidate.startsWith('..') && !path.isAbsolute(candidate));
||||||| bc50ba56aa:packages/web/server/lib/git/service.js
  const { directoryPath, repoRoot } = await createRepositoryGitContext(directory);
  const candidates = Array.from(new Set([
    toGitPath(path.relative(repoRoot, path.resolve(repoRoot, filePath))),
    toGitPath(path.relative(repoRoot, path.resolve(directoryPath, filePath))),
  ])).filter((candidate) => candidate && !candidate.startsWith('..') && !path.isAbsolute(candidate));

  if (isDocument) {
    const readRevision = async (revision, candidate) => {
      try {
        const { stdout } = await execFileAsync(getGitBinary(), ['show', `${revision}:${candidate}`], {
          cwd: repoRoot,
          encoding: 'buffer',
          windowsHide: true,
          maxBuffer: 50 * 1024 * 1024,
        });
        return stdout.length > 0 ? `data:application/octet-stream;base64,${stdout.toString('base64')}` : '';
      } catch {
        return '';
      }
    };
    for (const candidate of candidates) {
      // A renamed file has its old path in the parent.
      const parentPath = previousPath ? toGitPath(path.relative(repoRoot, path.resolve(path.dirname(path.resolve(repoRoot, candidate)), path.relative(path.dirname(filePath), previousPath)))) : candidate;
      const [original, modified] = await Promise.all([readRevision(`${hash}^`, parentPath), readRevision(hash, candidate)]);
      // For a rename only the new name tells which folder the paths are from.
      if (modified || (original && !previousPath)) return { original, modified, isBinary: false };
    }
    return { original: '', modified: '', isBinary: true };
  }

  let originalResult = null;
  let modifiedResult = null;
=======
  const { directoryPath, repoRoot } = await createRepositoryGitContext(directory);
  const candidates = Array.from(new Set([
    toGitPath(path.relative(repoRoot, path.resolve(repoRoot, filePath))),
    toGitPath(path.relative(repoRoot, path.resolve(directoryPath, filePath))),
  ])).filter((candidate) => candidate && !candidate.startsWith('..') && !path.isAbsolute(candidate));

  if (isDocument) {
    const readRevision = async (revision: string, candidate: string) => {
      try {
        const { stdout } = await execFileAsync(getGitBinary(), ['show', `${revision}:${candidate}`], {
          cwd: repoRoot,
          encoding: 'buffer',
          windowsHide: true,
          maxBuffer: 50 * 1024 * 1024,
        });
        return stdout.length > 0 ? `data:application/octet-stream;base64,${stdout.toString('base64')}` : '';
      } catch {
        return '';
      }
    };
    for (const candidate of candidates) {
      const parentPath = previousPath ? toGitPath(path.relative(repoRoot, path.resolve(path.dirname(path.resolve(repoRoot, candidate)), path.relative(path.dirname(filePath), previousPath)))) : candidate;
      const [original, modified] = await Promise.all([readRevision(`${hash}^`, parentPath), readRevision(hash, candidate)]);
      if (modified || (original && !previousPath)) return { original, modified, isBinary: false };
    }
    return { original: '', modified: '', isBinary: true };
  }

  let originalResult = null;
  let modifiedResult = null;
>>>>>>> upstream/main:packages/web/server/lib/git/service.ts

 if (isDocument) {
  const readRevision = async (revision, candidate) => {
   try {
    const { stdout } = await execFileAsync(getGitBinary(), ['show', `${revision}:${candidate}`], {
     cwd: repoRoot,
     encoding: 'buffer',
     windowsHide: true,
     maxBuffer: 50 * 1024 * 1024,
    });
    return stdout.length > 0 ? `data:application/octet-stream;base64,${stdout.toString('base64')}` : '';
   } catch {
    return '';
   }
  };
  for (const candidate of candidates) {
   // A renamed file has its old path in the parent.
   const parentPath = previousPath ? toGitPath(path.relative(repoRoot, path.resolve(path.dirname(path.resolve(repoRoot, candidate)), path.relative(path.dirname(filePath), previousPath)))) : candidate;
   const [original, modified] = await Promise.all([readRevision(`${hash}^`, parentPath), readRevision(hash, candidate)]);
   // For a rename only the new name tells which folder the paths are from.
   if (modified || (original && !previousPath)) return { original, modified, isBinary: false };
  }
  return { original: '', modified: '', isBinary: true };
 }

 let originalResult = null;
 let modifiedResult = null;

 for (const candidate of candidates) {
  const [candidateOriginalResult, candidateModifiedResult] = await Promise.all([
   runGitCommand(repoRoot, ['show', `${hash}^:${candidate}`]),
   runGitCommand(repoRoot, ['show', `${hash}:${candidate}`]),
  ]);

  if (candidateOriginalResult.success || candidateModifiedResult.success) {
   originalResult = candidateOriginalResult;
   modifiedResult = candidateModifiedResult;
   break;
  }
 }

 if (!originalResult || !modifiedResult) {
  const resolvedPath = await resolveGitCommitFilePath(repoRoot, hash, candidates);
  [originalResult, modifiedResult] = await Promise.all([
   runGitCommand(repoRoot, ['show', `${hash}^:${resolvedPath}`]),
   runGitCommand(repoRoot, ['show', `${hash}:${resolvedPath}`]),
  ]);
 }

 const original = originalResult.success ? originalResult.stdout : '';
 const modified = modifiedResult.success ? modifiedResult.stdout : '';

 if (!originalResult.success && !modifiedResult.success) {
  throw new Error(`Failed to read file content at commit ${hash}: ${originalResult.stderr || modifiedResult.stderr}`);
 }

 return { original, modified, isBinary: false };
}
