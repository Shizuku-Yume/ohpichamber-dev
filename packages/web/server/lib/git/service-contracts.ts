import type { SimpleGit, SimpleGitOptions } from 'simple-git';
import type { EnvironmentRuntime } from '../environment/runtime.js';

export type GitEnvironment = Pick<EnvironmentRuntime, 'forDirectory'>;
export interface CommitDiffOptions extends DiffOptions {
  hash?: unknown;
}
export type GitUnsafeOptions = NonNullable<SimpleGitOptions['unsafe']>;
export type GitFactoryOptions = Omit<Partial<SimpleGitOptions>, 'spawnOptions'> & {
  spawnOptions?: Pick<import('node:child_process').SpawnOptions, 'uid' | 'gid' | 'windowsHide'>;
};
export interface GitOptions {
  stallTimeoutMs?: number;
  optionalLocks?: boolean;
  extraEnv?: NodeJS.ProcessEnv;
}
export interface GitCommandOptions {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}
export interface GitCommandResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  message?: string;
  timedOut?: boolean;
  spawnFailed?: boolean;
}
export interface WorktreeEntry {
  worktree: string;
  head?: string;
  branchRef?: string;
  branch?: string;
  bare?: boolean;
  prunable?: boolean;
  locked?: boolean;
}
export interface HydrationPart {
  path: string;
  status: string;
  endpoint?: { displayUrl: string; fingerprint: string } | undefined;
  error?: { code: string; message: string };
}
export interface CheckoutHydration {
  status: string;
  submodules: readonly HydrationPart[];
  lfs: readonly HydrationPart[];
}
export interface WorktreeBootstrapState {
  status: string;
  phase: string;
  error: string | null;
  updatedAt: number;
  hydration?: unknown;
  errorCode?: unknown;
}
export interface BootstrapStore {
  write(directory: string, state: WorktreeBootstrapState): Promise<WorktreeBootstrapState>;
  read(directory: string): Promise<WorktreeBootstrapState | null>;
  remove(directory: string, options?: { ifMissingFailed?: boolean }): Promise<boolean>;
  completeHydration(directory: string): Promise<WorktreeBootstrapState | null>;
}
export interface BootstrapOptions {
  bootstrapStore?: BootstrapStore | undefined;
}
export interface WorktreeCreateInput {
  mode?: string;
  name?: string;
  worktreeName?: string;
  branchName?: string;
  existingBranch?: string;
  startRef?: string | null;
  expectedRevision?: string;
  setUpstream?: boolean;
  upstreamRemote?: string;
  upstreamBranch?: string;
  ensureRemoteName?: string;
  ensureRemoteUrl?: string;
  contributorFork?: boolean;
  contributorTransferComplete?: boolean;
  changeRequestTransfer?: boolean;
  returnAfterDirectoryCreated?: boolean;
  createCommand?: string;
  startCommand?: string;
}
export interface ContributorSource {
  headRef: string;
  sourceProject: { id: string };
  targetProject: { id: string };
  context: {
    provider: string;
    instance: string;
    accountId: string;
    bindingRevision: number;
    primaryRemote: string;
  };
}
export interface ContributorProvenanceInput {
  kind: string;
  remoteName: string;
  endpointFingerprint: string;
  sourceSha: string;
  sourceRef: string;
  sourceProjectId: string;
  targetProjectId: string;
  provider: string;
  instance: string;
  accountId: string;
  bindingRevision: number;
  primaryRemote: string;
  projectId: string;
  setupCommand: string;
}
export interface ChangeRequestLocalBranch {
  branch: string;
  tip: string;
  backupBranch: string | null;
}
export interface WorktreeServerOptions extends BootstrapOptions {
  contributorSource?: ContributorSource | null;
  contributorProvenance?: {
    compareAndSwap(directory: string, revision: number, record: ContributorProvenanceInput): Promise<{ revision: number }>;
  } | undefined;
  changeRequestLocalBranch?: ChangeRequestLocalBranch;
  hydrateCheckout?: ((input: { directory: string; parentRemoteName: string }) => Promise<CheckoutHydration | null | undefined>) | undefined;
}
export interface WorktreeCandidate {
  name: string;
  directory: string;
  branch: string;
}
export interface WorktreeProjectContext {
  projectID: string;
  requestedDirectory?: string | undefined;
  sandbox: string;
  primaryWorktree: string;
  worktreeRoot: string;
  defaultWorktreeRoot: string;
  legacyWorktreeRoot?: string | undefined;
}
export interface WorktreeCreateResult {
  head: string;
  name: string;
  branch: string;
  path: string;
  directoryCreated: boolean;
  bootstrapStatus: WorktreeBootstrapState;
  sourceFetchFailed?: boolean;
  sourceFetchReason?: string;
  branchBackup?: string;
  provenance?: { kind: string; revision: number; trust: string; push: string };
}
export interface UpstreamConfiguration {
  primaryWorktree: string;
  worktreeDirectory: string;
  localBranch: string;
  setUpstream: boolean;
  upstreamRemote: string;
  upstreamBranch: string;
  ensureRemoteName: string;
  ensureRemoteUrl: string;
}
export interface WorktreeBootstrapTask extends WorktreeServerOptions {
  directory: string;
  projectDirectory?: string | undefined;
  primaryWorktree: string;
  localBranch: string;
  setUpstream: boolean;
  upstreamRemote: string;
  upstreamBranch: string;
  ensureRemoteName: string;
  ensureRemoteUrl: string;
  startCommand: string | undefined;
  contributorFork: boolean;
  checkoutRemoteName: string;
  populated: boolean;
}
export interface WorktreeRemovalInput {
  directory?: string;
  deleteLocalBranch?: boolean;
  cancelSetup?: boolean;
  teardownCommand?: string | undefined;
  disposeInstance?: ((directory: string) => Promise<void>) | undefined;
  isContributorCheckout?: ((directory: string) => Promise<boolean>) | undefined;
}
export interface WorktreeArchiveInput extends WorktreeRemovalInput {
  id?: unknown;
  title?: unknown;
  sessionIds?: unknown;
}
export interface IntegratePlanInput {
  repoRoot?: unknown;
  sourceBranch?: unknown;
  targetBranch?: unknown;
  commits?: unknown;
}
export interface IntegrateStateInput extends IntegratePlanInput {
  tempWorktreePath?: unknown;
  cleanTargetWorktrees?: unknown;
  remainingCommits?: unknown;
  currentCommit?: unknown;
}
export interface DiffOptions {
  path?: string | undefined;
  staged?: boolean;
  contextLines?: number | undefined;
  previousPath?: string | undefined;
}
export interface RangeOptions extends DiffOptions {
  base?: string;
  head?: string;
  includeWorkingTree?: boolean;
}
export interface RepositoryGitContext {
  repoRoot: string;
  git: SimpleGit;
}
export type RepositoryGitPaths = { supported: false; reason: string } | {
  supported: true;
  gitDirectory: string;
  commonDirectory: string;
  bare: boolean;
};

export interface ErrorFields {
  code?: unknown;
  stdout?: unknown;
  stderr?: unknown;
  message?: unknown;
  killed?: unknown;
  reason?: unknown;
  statusCode?: unknown;
  hydration?: unknown;
  bootstrapStatus?: unknown;
  status?: unknown;
  branch?: unknown;
  parent?: unknown;
}
export interface GitFileContext {
  absolutePath: string;
  repoPath: string;
  repoRoot: string;
  isSymbolicLink: boolean;
  isSubmodule: boolean;
}
export interface DiffStats {
  insertions: number;
  deletions: number;
}
export interface WorktreeTopologyEntry {
  directories: Set<string>;
  fingerprint: string | null;
}
export interface WorktreeTopologyEvent {
  directories: string[];
  at: number;
}
export interface StartCommandResult {
  success: boolean;
  message?: string;
  stdout?: string;
  stderr?: string;
}
export interface StartCommandOptions {
  timeoutMs?: number;
  signal?: AbortSignal | undefined;
  env?: NodeJS.ProcessEnv;
}
export interface BranchStart {
  start: string;
  force?: boolean;
  noTrack?: boolean;
}
export interface SnapshotOptions {
  ref: string;
  message: string;
  oldValue?: string;
}
export interface LogOptions {
  maxCount?: number | undefined;
  all?: boolean;
  file?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export type HunkAction = 'stage' | 'unstage' | 'discard';

export interface SubmoduleState {
  headCommit: string | null;
  indexCommit: string | null;
  worktreeCommit: string | null;
  hasTrackedChanges: boolean;
  hasUntrackedFiles: boolean;
  hasConflict: boolean;
}

export type PathDiffResult = {
  path: string | undefined;
  diff: string;
  submodule: SubmoduleState | null;
} | {
  path: string | undefined;
  error: unknown;
  code: string | null;
};

export interface CommitFile extends DiffStats {
  path: string;
  isBinary: boolean;
  changeType: string;
  previousPath?: string;
}

export interface PostCheckoutHookAction {
  kind: 'post-checkout-hook';
  path: string;
  content: Buffer;
  contentDigest: string;
  gitDir: string;
  workTree: string;
}

import type { JsonValue } from '../shared/json-values.js';

export interface WorktreeLeaseControl {
  acquire: (directory: string, leaseId: string) => Promise<JsonValue | void>;
  release: (leaseId: string) => Promise<void>;
}

export interface WorktreeArchiveSessionEntry {
  sessionId: string;
  rootSessionId?: string;
  workspaceId?: string;
  progress: string;
}

export interface WorktreeArchiveBinding {
  archiveRef: string;
  snapshotCommit: string;
  phase: string;
  revision: number;
  targetWorkspaceId?: string | null;
  branchName?: string;
  branchOid?: string | null;
  applyAttempted?: boolean | number;
  preapplyHead?: string | null;
  preapplyFingerprint?: string | null;
  expectedFingerprint?: string | null;
  restoreCasStarted?: boolean | number;
  restoreCasCompleted?: boolean | number;
  deleteCasCompleted?: boolean | number;
  deleteBranchRequested?: boolean | number;
  sessions: Array<string | WorktreeArchiveSessionEntry>;
}

export interface WorktreeArchiveOwner {
  key: { hostProjectId: string; archiveId: string };
  claimId?: string;
  revision?: number;
  binding?: WorktreeArchiveBinding;
  recovering?: boolean;
  previousTargetDirectory?: string;
}

export interface WorktreeArchiveCapturedOwner {
  key: { hostProjectId: string; archiveId: string };
  claimId: string;
  revision?: number;
  binding?: WorktreeArchiveBinding;
}

export interface WorktreeArchiveBoundOwner {
  key: { hostProjectId: string; archiveId: string };
  claimId: string;
  binding: WorktreeArchiveBinding;
  recovering?: boolean;
  previousTargetDirectory?: string | undefined;
}

export interface WorktreeArchiveBoundRestoreOwner extends WorktreeArchiveBoundOwner {
  targetWorkspaceId: string;
  recoveringRemoval: boolean;
}

export interface WorktreeArchivePendingDeleteOwner {
  key: { hostProjectId: string; archiveId: string };
  claimId?: string;
  binding: WorktreeArchiveBinding;
  recoveringRemoval: boolean;
}

export interface RestoreFingerprint {
  head: string;
  tree: string;
  index: string;
  unmerged: string;
  status: string;
  conflicts: boolean;
}

export interface WorktreeArchiveSessionService {
  captureWorktreeArchive?: (input: {
    projectDirectory: string;
    worktreeDirectory: string;
    archiveId: string;
    archiveRef: string;
    snapshotCommit: string;
    claimId: string;
    branchName: string;
    branchOid: string | null;
    archivedAt: number;
  }) => Promise<WorktreeArchiveCapturedOwner>;
  prepareWorktreeArchiveRemoval?: (owner: WorktreeArchiveCapturedOwner) => Promise<JsonValue | object | null | void>;
  finishWorktreeArchive?: (owner: WorktreeArchiveCapturedOwner) => Promise<WorktreeArchiveBinding>;
  rollbackWorktreeArchive?: (owner: WorktreeArchiveCapturedOwner, partial: boolean) => Promise<JsonValue | object | null | void>;
  discardWorktreeArchive?: (owner: WorktreeArchiveCapturedOwner) => Promise<JsonValue | object | null | void>;
  resolveWorktreeArchivePinnedTarget?: (input: {
    projectDirectory: string;
    archiveId: string;
    revision: number;
  }) => Promise<string>;
  prepareWorktreeArchiveRestore?: (input: {
    projectDirectory: string;
    targetDirectory: string;
    archiveId: string;
    recovery: unknown;
    expectedRevision: number | undefined;
  }) => Promise<WorktreeArchiveBoundRestoreOwner | null>;
  markWorktreeArchiveRestoreCasStarted?: (owner: WorktreeArchiveBoundOwner, revision: number) => Promise<WorktreeArchiveBinding>;
  markWorktreeArchiveRestoreCasCompleted?: (owner: WorktreeArchiveBoundOwner, revision: number) => Promise<JsonValue | object | null | void>;
  pinWorktreeArchiveRestore?: (owner: WorktreeArchiveBoundRestoreOwner, fingerprints: {
    preapplyHead: string;
    preapplyFingerprint: RestoreFingerprint;
    expectedFingerprint: RestoreFingerprint;
  }) => Promise<WorktreeArchiveBinding>;
  markWorktreeArchiveRestoreAttempted?: (owner: WorktreeArchiveBoundOwner, revision: number) => Promise<WorktreeArchiveBinding>;
  finishWorktreeArchiveRestore?: (owner: WorktreeArchiveBoundOwner) => Promise<WorktreeArchiveBinding>;
  finalizeWorktreeArchiveRestore?: (owner: WorktreeArchiveBoundOwner, revision: number) => Promise<WorktreeArchiveBinding>;
  releaseWorktreeArchiveRestore?: (owner: WorktreeArchiveBoundOwner) => Promise<JsonValue | object | null | void>;
  cleanupWorktreeArchiveRestore?: (owner: WorktreeArchiveBoundOwner) => Promise<JsonValue | object | null | void>;
  prepareWorktreeArchiveDelete?: (input: {
    projectDirectory: string;
    archiveId: string;
  }) => Promise<WorktreeArchivePendingDeleteOwner | null>;
  claimWorktreeArchiveDelete?: (owner: WorktreeArchivePendingDeleteOwner) => Promise<WorktreeArchiveBoundOwner>;
  deleteWorktreeArchiveSessions?: (owner: WorktreeArchiveBoundOwner) => Promise<WorktreeArchiveBinding>;
  finalizeWorktreeArchiveDelete?: (owner: WorktreeArchiveBoundOwner, revision: number, deleteBranch: boolean) => Promise<WorktreeArchiveBinding>;
  markWorktreeArchiveDeleteCasCompleted?: (owner: WorktreeArchiveBoundOwner, revision: number) => Promise<JsonValue | object | null | void>;
}
