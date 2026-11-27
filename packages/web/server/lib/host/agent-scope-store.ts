import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { z } from 'zod';
import { DisplayPathSchema, EntityIdSchema, ProjectSchema, type Project } from '@openchamber/agent-contract';
import {
  HostMetadataError,
  MetadataCorruptError,
  MetadataReadError,
  MetadataWriteError,
  createMetadataLifecycle,
  withTransaction,
} from './metadata-sqlite.js';

const DirectorySchema = z.string().min(1).refine((directory) => path.isAbsolute(directory));
const WorkspaceInputSchema = z.strictObject({
  hostProjectId: EntityIdSchema,
  projectId: EntityIdSchema.optional(),
  workspaceId: EntityIdSchema.optional(),
  projectDirectory: DirectorySchema,
  workspaceDirectory: DirectorySchema,
  agentDirectory: DirectorySchema,
  name: z.string().min(1),
  displayPath: DisplayPathSchema.optional(),
});
const ProjectRowSchema = z.strictObject({
  projectId: EntityIdSchema,
  hostProjectId: EntityIdSchema,
  projectDirectory: DirectorySchema,
  name: z.string(),
  displayPath: DisplayPathSchema.nullable(),
});
const WorkspaceRowSchema = ProjectRowSchema.extend({
  workspaceId: EntityIdSchema,
  cwd: DirectorySchema,
  agentDirectoryId: EntityIdSchema,
  agentDirectory: DirectorySchema,
});
const SessionInputSchema = z.strictObject({
  sessionId: EntityIdSchema,
  rootSessionId: EntityIdSchema,
  workspaceId: EntityIdSchema,
  agentDirectoryId: EntityIdSchema.optional(),
});
const SessionRowSchema = WorkspaceRowSchema.extend({
  sessionId: EntityIdSchema,
  rootSessionId: EntityIdSchema,
});
const RelocationSchema = z.strictObject({
  rootSessionId: EntityIdSchema,
  transactionId: EntityIdSchema,
  sourceWorkspaceId: EntityIdSchema,
  destinationWorkspaceId: EntityIdSchema,
});
const WorktreeArchiveKeySchema = z.strictObject({
  hostProjectId: EntityIdSchema,
  archiveId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
});
const WorktreeArchiveCreateSchema = WorktreeArchiveKeySchema.extend({
  archiveRef: z.string().min(1),
  snapshotCommit: z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/),
  anchorWorkspaceId: EntityIdSchema,
  claimId: EntityIdSchema,
  claimGeneration: EntityIdSchema,
  branchName: z.string(),
  branchOid: z.string().nullable(),
});

const ErrorCodeSchema = z.object({ code: z.string() });
const WorkspaceIdRowSchema = z.object({ workspace_id: z.string() });
const WorkspaceCamelIdRowSchema = z.object({ workspaceId: z.string() });
const AgentDirectoryIdRowSchema = z.object({ agent_directory_id: z.string() });
const SessionIdCamelRowSchema = z.object({ sessionId: z.string() });
const WorktreeScopeRowSchema = z.object({
  claimId: z.string().nullable(),
  phase: z.string(),
  sourceCwd: z.string(),
  targetCwd: z.string().nullable(),
});
const AdmissionRowSchema = z.object({ workspaceId: z.string() });
const PriorAdmissionRowSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  rootSessionId: z.string(),
});
const RelocationScanRowSchema = z.object({
  rootId: z.string(),
  sourceId: z.string(),
  destinationId: z.string(),
});
const ArchiveRelocationOwnerRowSchema = z.object({
  anchorWorkspaceId: z.string(),
  targetWorkspaceId: z.string().nullable(),
  sourceWorkspaceId: z.string(),
});
const WorktreeArchiveBindingRowSchema = z.object({
  hostProjectId: z.string(),
  archiveId: z.string(),
  archiveRef: z.string(),
  snapshotCommit: z.string(),
  projectId: z.string(),
  anchorWorkspaceId: z.string(),
  phase: z.string(),
  revision: z.number(),
  claimId: z.string().nullable(),
  claimGeneration: z.string().nullable(),
  targetWorkspaceId: z.string().nullable(),
  preapplyHead: z.string().nullable(),
  preapplyFingerprint: z.string().nullable(),
  expectedFingerprint: z.string().nullable(),
  applyAttempted: z.number(),
  branchName: z.string(),
  branchOid: z.string().nullable(),
  deleteBranchRequested: z.number(),
  deleteCasCompleted: z.number(),
  restoreCasStarted: z.number(),
  restoreCasCompleted: z.number(),
});
const WorktreeArchiveSessionRowSchema = z.object({
  sessionId: z.string(),
  rootSessionId: z.string(),
  workspaceId: z.string(),
  agentDirectoryId: z.string(),
  originalArchiveRevision: z.string().nullable(),
  originalArchivedAt: z.number().nullable(),
  expectedArchiveRevision: z.string().nullable(),
  targetWorkspaceId: z.string().nullable(),
  progress: z.string(),
  deleteOperationId: z.string().nullable(),
});
const SessionArchiveRowSchema = z.object({
  revision: z.union([z.number(), z.bigint()]),
  archived_at: z.number().nullable(),
});
const RevisionOnlyRowSchema = z.object({ revision: z.union([z.number(), z.bigint()]) });
const CountRowSchema = z.object({ count: z.number() });
const ProjectIdOnlySchema = z.object({ projectId: z.string() });
const RestoreFingerprintSchema = z.strictObject({
  head: z.string(),
  tree: z.string(),
  index: z.string(),
  unmerged: z.string(),
  status: z.string(),
  conflicts: z.boolean(),
});

export type WorkspaceScopeInput = z.infer<typeof WorkspaceInputSchema>;
export type HostWorkspaceScopeRecord = z.infer<typeof WorkspaceRowSchema>;
export type SessionScopeInput = z.infer<typeof SessionInputSchema>;
export type HostSessionScopeRecord = z.infer<typeof SessionRowSchema>;
export type SessionRelocationRecord = z.infer<typeof RelocationSchema>;
export type WorktreeArchiveKey = z.infer<typeof WorktreeArchiveKeySchema>;
export type WorktreeArchiveCreateInput = z.infer<typeof WorktreeArchiveCreateSchema>;
export type WorktreeArchiveSessionBinding = z.infer<typeof WorktreeArchiveSessionRowSchema>;
export type RestoreFingerprintInput = z.infer<typeof RestoreFingerprintSchema>;

export interface WorktreeArchiveBinding extends z.infer<typeof WorktreeArchiveBindingRowSchema> {
  anchorDirectory: string;
  sessions: WorktreeArchiveSessionBinding[];
}

export interface AgentScopeStoreFs {
  realpath: typeof fs.promises.realpath;
  stat: typeof fs.promises.stat;
}

export interface AgentScopeStoreOptions {
  database: DatabaseSync;
  fsPromises?: AgentScopeStoreFs | undefined;
}

export interface ClaimWorktreeArchiveInput {
  claimId: string;
  claimGeneration: string;
  revision: number;
  phase: 'restoring' | 'deleting';
}

export interface PinWorktreeRestoreInput {
  claimId: string;
  revision: number;
  targetWorkspaceId: string;
  preapplyHead: string;
  preapplyFingerprint: RestoreFingerprintInput;
  expectedFingerprint: RestoreFingerprintInput;
  recovery?: boolean | undefined;
}

export interface ReserveWorktreeArchiveDeleteResult {
  action: 'delete' | 'done' | 'skip';
  binding: WorktreeArchiveBinding | null;
  operationId?: string | null;
}

export interface AgentScopeStore {
  ensureWorkspace(input: WorkspaceScopeInput): Promise<HostWorkspaceScopeRecord>;
  getWorkspace(workspaceId: string): Promise<HostWorkspaceScopeRecord | null>;
  bindSession(input: SessionScopeInput): Promise<HostSessionScopeRecord>;
  getSession(sessionId: string): Promise<HostSessionScopeRecord | null>;
  removeSessionFamily(rootSessionId: string): Promise<number>;
  listSessionFamily(rootSessionId: string): Promise<HostSessionScopeRecord[]>;
  rebindSessionRoot(sessionId: string, rootSessionId: string): Promise<HostSessionScopeRecord | null>;
  getRelocation(rootSessionId: string): Promise<SessionRelocationRecord | null>;
  createRelocation(input: SessionRelocationRecord, claimId?: string): Promise<SessionRelocationRecord>;
  rebindSessionFamily(input: SessionRelocationRecord, claimId?: string): Promise<HostSessionScopeRecord[]>;
  rollbackSessionFamily(input: SessionRelocationRecord, claimId?: string): Promise<HostSessionScopeRecord[]>;
  clearRelocation(input: SessionRelocationRecord): Promise<void>;
  listProjects(): Promise<{ items: Project[]; errors: Record<string, string> }>;
  listWorkspaces(projectId?: string): Promise<{ items: HostWorkspaceScopeRecord[]; errors: Record<string, string> }>;
  listArchivedWorktreeWorkspaces(): Promise<string[]>;
  listWorkspacesWithArchivedSessions(): Promise<string[]>;
  hasArchivedSessions(workspaceId: string): Promise<boolean>;
  isWorktreeArchived(workspaceId: string): Promise<boolean>;
  createWorktreeArchive(input: WorktreeArchiveCreateInput): Promise<WorktreeArchiveBinding | null>;
  getWorktreeArchive(key: WorktreeArchiveKey): Promise<WorktreeArchiveBinding | null>;
  claimWorktreeArchive(key: WorktreeArchiveKey, input: ClaimWorktreeArchiveInput): Promise<WorktreeArchiveBinding | null>;
  pinWorktreeRestore(key: WorktreeArchiveKey, input: PinWorktreeRestoreInput): Promise<WorktreeArchiveBinding | null>;
  markWorktreeRestoreAttempted(key: WorktreeArchiveKey, claimId: string, revision: number): Promise<WorktreeArchiveBinding | null>;
  releaseWorktreeArchiveClaim(key: WorktreeArchiveKey, claimId: string): Promise<WorktreeArchiveBinding | null>;
  markWorktreeRestoreMove(key: WorktreeArchiveKey, claimId: string, rootSessionId: string): Promise<WorktreeArchiveBinding | null>;
  completeWorktreeRestoreFamily(key: WorktreeArchiveKey, claimId: string, rootSessionId: string): Promise<WorktreeArchiveBinding | null>;
  reserveWorktreeArchiveDeleteFamily(key: WorktreeArchiveKey, claimId: string, rootSessionId: string): Promise<ReserveWorktreeArchiveDeleteResult>;
  completeWorktreeArchiveDeleteFamily(key: WorktreeArchiveKey, claimId: string, rootSessionId: string, deletedIds: string[]): Promise<WorktreeArchiveBinding | null>;
  recheckWorktreeArchive(key: WorktreeArchiveKey, claimId: string): Promise<WorktreeArchiveBinding>;
  setWorktreeArchivePhase(key: WorktreeArchiveKey, claimId: string, revision: number, phase: string): Promise<WorktreeArchiveBinding | null>;
  archiveWorktreeSessions(key: WorktreeArchiveKey, claimId: string, archivedAt: number): Promise<WorktreeArchiveBinding | null>;
  rollbackWorktreeSessions(key: WorktreeArchiveKey, claimId: string, partial: boolean): Promise<WorktreeArchiveBinding | null>;
  finishWorktreeArchive(key: WorktreeArchiveKey, claimId: string): Promise<WorktreeArchiveBinding | null>;
  markWorktreeArchiveDeleteFinalizing(key: WorktreeArchiveKey, claimId: string, revision: number, deleteBranch: boolean): Promise<WorktreeArchiveBinding | null>;
  markWorktreeArchiveDeleteCasCompleted(key: WorktreeArchiveKey, claimId: string, revision: number): Promise<WorktreeArchiveBinding | null>;
  markWorktreeArchiveRestoreCasStarted(key: WorktreeArchiveKey, claimId: string, revision: number): Promise<WorktreeArchiveBinding | null>;
  markWorktreeArchiveRestoreCasCompleted(key: WorktreeArchiveKey, claimId: string, revision: number): Promise<WorktreeArchiveBinding | null>;
  discardWorktreeArchive(key: WorktreeArchiveKey): Promise<void>;
  checkWorktreeScope(directory: string, claimId?: string): Promise<void>;
  assertSessionWritable(sessionId: string): void;
  reserveSessionDelete(sessionId: string): Promise<string>;
  releaseSessionDelete(id: string): void;
  reserveSessionAdmission(workspaceId: string, operation: 'create' | 'fork' | 'reopen' | 'discovery', rootSessionId: string): Promise<string>;
  releaseSessionAdmission(id: string): Promise<void>;
  markSessionAdmissionUncertain(id: string, answered?: boolean): void;
  listPriorSessionAdmissions(workspaceId: string): Promise<Array<{ id: string; workspaceId: string; rootSessionId: string }>>;
  close(): Promise<void>;
  flush(): Promise<void>;
}

const isInsideOrSame = (root: string, directory: string): boolean => {
  const relative = path.relative(root, directory);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

const scopesOverlap = (left: string, right: string): boolean =>
  isInsideOrSame(left, right) || isInsideOrSame(right, left);

const projectColumns = `p.project_id AS projectId, p.host_project_id AS hostProjectId,
  p.directory AS projectDirectory, p.name, p.display_path AS displayPath`;
const workspaceColumns = `${projectColumns}, w.workspace_id AS workspaceId, w.cwd,
  d.agent_directory_id AS agentDirectoryId, d.directory AS agentDirectory`;
const workspaceJoin = `host_agent_workspaces w
  JOIN host_agent_projects p ON p.project_id = w.project_id
  JOIN host_agent_directories d ON d.agent_directory_id = w.agent_directory_id`;
const unpinnedRestore = `phase = 'restoring' AND target_workspace_id IS NULL
  AND preapply_head IS NULL AND preapply_fingerprint IS NULL AND expected_fingerprint IS NULL
  AND apply_attempted = 0 AND restore_cas_started = 0 AND restore_cas_completed = 0
  AND NOT EXISTS (SELECT 1 FROM host_worktree_archive_sessions s
    WHERE s.host_project_id = host_worktree_archives.host_project_id AND s.archive_id = host_worktree_archives.archive_id
      AND (s.progress NOT IN ('pending', 'archived') OR s.target_workspace_id IS NOT NULL))`;

const parseRow = <Schema extends z.ZodType>(schema: Schema, row: Record<string, SQLOutputValue>): z.infer<Schema> => {
  const parsed = schema.safeParse(row);
  if (!parsed.success) throw new MetadataCorruptError('Canonical Host scope has an invalid shape');
  return parsed.data;
};

const readFailure = (error: Error | string): HostMetadataError =>
  error instanceof MetadataCorruptError || error instanceof MetadataReadError
    ? error
    : new MetadataReadError('Could not read canonical Host scope', error);

const writeFailure = (error: Error | string): HostMetadataError =>
  error instanceof MetadataCorruptError || error instanceof MetadataWriteError
    ? error
    : new MetadataWriteError('Could not persist canonical Host scope', error);

export const createAgentScopeStore = ({
  database,
  fsPromises = fs.promises,
}: AgentScopeStoreOptions): AgentScopeStore => {
  const db = database;
  const lifecycle = createMetadataLifecycle(db, false);
  withTransaction(db, () => db.prepare(`UPDATE host_worktree_archives SET phase = 'archived', revision = revision + 1
    WHERE claim_id IS NULL AND claim_generation IS NULL AND ${unpinnedRestore}`).run());
  const pendingSessionDeletes = new Map<string, string>();
  const pendingDiscoveries = new Map<string, string>();
  const liveAdmissions = new Set<string>();
  const uncertainAdmissions = new Set<string>();
  const answeredAdmissions = new Set<string>();
  const workspaceStatement = db.prepare(`SELECT ${workspaceColumns} FROM ${workspaceJoin} WHERE w.workspace_id = ?`);
  const sessionStatement = db.prepare(`SELECT ${workspaceColumns}, s.session_id AS sessionId, s.root_session_id AS rootSessionId
    FROM ${workspaceJoin} JOIN host_agent_sessions s ON w.workspace_id = s.workspace_id
    WHERE s.session_id = ? AND s.agent_directory_id = w.agent_directory_id`);
  const readWorkspace = (workspaceId: string): HostWorkspaceScopeRecord | null => {
    const row = workspaceStatement.get(workspaceId);
    if (row) return parseRow(WorkspaceRowSchema, row);
    if (db.prepare('SELECT workspace_id FROM host_agent_workspaces WHERE workspace_id = ?').get(workspaceId)) {
      throw new MetadataCorruptError('Canonical workspace refers to a missing scope owner');
    }
    return null;
  };
  const readSession = (sessionId: string): HostSessionScopeRecord | null => {
    const row = sessionStatement.get(sessionId);
    if (row) return parseRow(SessionRowSchema, row);
    if (db.prepare('SELECT session_id FROM host_agent_sessions WHERE session_id = ?').get(sessionId)) {
      throw new MetadataCorruptError('Canonical session refers to a missing or conflicting scope owner');
    }
    return null;
  };
  const readFamily = (rootSessionId: string): HostSessionScopeRecord[] => {
    const rows = db.prepare('SELECT session_id AS sessionId FROM host_agent_sessions WHERE root_session_id = ? ORDER BY session_id').all(rootSessionId);
    const members: HostSessionScopeRecord[] = [];
    for (const raw of rows) {
      const row = SessionIdCamelRowSchema.parse(raw);
      const session = readSession(EntityIdSchema.parse(row.sessionId));
      if (!session) throw new MetadataCorruptError('Canonical session family refers to a missing member');
      members.push(session);
    }
    return members;
  };
  const readRelocation = (rootSessionId: string): SessionRelocationRecord | null => {
    const row = db.prepare('SELECT root_session_id AS rootSessionId, transaction_id AS transactionId, source_workspace_id AS sourceWorkspaceId, destination_workspace_id AS destinationWorkspaceId FROM host_agent_relocations WHERE root_session_id = ?').get(rootSessionId);
    return row ? parseRow(RelocationSchema, row) : null;
  };
  const matchingRelocation = (input: SessionRelocationRecord): SessionRelocationRecord => {
    const value = RelocationSchema.parse(input);
    const pending = readRelocation(value.rootSessionId);
    if (!pending || pending.transactionId !== value.transactionId || pending.sourceWorkspaceId !== value.sourceWorkspaceId || pending.destinationWorkspaceId !== value.destinationWorkspaceId) {
      throw new MetadataWriteError('Canonical relocation intent is stale');
    }
    return value;
  };
  const matchingFamily = (rootSessionId: string, workspaceId: string): HostSessionScopeRecord[] => {
    const family = readFamily(rootSessionId);
    if (!family.some((member) => member.sessionId === rootSessionId) || family.some((member) => member.workspaceId !== workspaceId)) {
      throw new MetadataWriteError('Canonical relocation family does not match its admitted Host owner');
    }
    return family;
  };
  const assertWorktreeScopeAvailable = (directory: string, claimId?: string, subtree = false): void => {
    const rows = db.prepare(`SELECT a.claim_id AS claimId, a.phase,
      source.cwd AS sourceCwd, target.cwd AS targetCwd
      FROM host_worktree_archives a
      JOIN host_agent_workspaces source ON source.workspace_id = a.anchor_workspace_id
      LEFT JOIN host_agent_workspaces target ON target.workspace_id = a.target_workspace_id
      WHERE a.claim_id IS NOT NULL OR a.phase IN ('capturing', 'archiving', 'removal_pending', 'restoring', 'deleting', 'finalizing')`).all();
    for (const raw of rows) {
      const row = WorktreeScopeRowSchema.parse(raw);
      if (row.claimId === claimId && claimId) continue;
      if (isInsideOrSame(row.sourceCwd, directory) || (row.targetCwd && isInsideOrSame(row.targetCwd, directory))
        || (subtree && (isInsideOrSame(directory, row.sourceCwd) || (row.targetCwd && isInsideOrSame(directory, row.targetCwd))))) {
        throw Object.assign(new MetadataWriteError('The worktree archive owns this Host scope'), { code: 'COMMAND_IN_FLIGHT', status: 409 });
      }
    }
  };
  const assertNoPendingScopeMutation = (directory: string, binding: WorktreeArchiveBinding | null = null): void => {
    for (const cwd of pendingDiscoveries.values()) {
      if (scopesOverlap(directory, cwd)) throw Object.assign(new MetadataWriteError('Session discovery is in progress in this worktree'), { code: 'COMMAND_IN_FLIGHT', status: 409 });
    }
    const admissions = db.prepare('SELECT workspace_id AS workspaceId FROM host_session_admissions').all();
    for (const raw of admissions) {
      const admission = AdmissionRowSchema.parse(raw);
      const workspace = readWorkspace(admission.workspaceId);
      if (!workspace || scopesOverlap(directory, workspace.cwd)) throw Object.assign(new MetadataWriteError('A session admission is in progress or requires recovery in this worktree'), { code: 'COMMAND_IN_FLIGHT', status: 409 });
    }
    for (const cwd of pendingSessionDeletes.values()) {
      if (scopesOverlap(directory, cwd)) throw Object.assign(new MetadataWriteError('A session deletion is in progress in this worktree'), { code: 'COMMAND_IN_FLIGHT', status: 409 });
    }
    const relocations = db.prepare('SELECT root_session_id AS rootId, source_workspace_id AS sourceId, destination_workspace_id AS destinationId FROM host_agent_relocations').all();
    for (const raw of relocations) {
      const relocation = RelocationScanRowSchema.parse(raw);
      if (binding?.phase === 'restoring' && binding.targetWorkspaceId === relocation.destinationId
        && binding.sessions.some((item) => item.sessionId === relocation.rootId && item.rootSessionId === relocation.rootId
          && item.workspaceId === relocation.sourceId && item.progress === 'move_intent')) continue;
      const source = readWorkspace(relocation.sourceId);
      const destination = readWorkspace(relocation.destinationId);
      if (!source || !destination || scopesOverlap(directory, source.cwd) || scopesOverlap(directory, destination.cwd)) {
        throw Object.assign(new MetadataWriteError('A session relocation is in progress in this worktree'), { code: 'COMMAND_IN_FLIGHT', status: 409 });
      }
    }
  };
  const assertSessionWritable = (sessionId: string): void => {
    const session = readSession(EntityIdSchema.parse(sessionId));
    if (session) assertWorktreeScopeAvailable(session.cwd);
  };
  const assertArchiveRelocationOwner = (
    claimId: string | undefined,
    rootSessionId: string,
    sourceWorkspaceId: string,
    destinationWorkspaceId: string,
  ): void => {
    if (!claimId) return;
    const raw = db.prepare(`SELECT a.anchor_workspace_id AS anchorWorkspaceId, a.target_workspace_id AS targetWorkspaceId,
      s.workspace_id AS sourceWorkspaceId FROM host_worktree_archives a
      JOIN host_worktree_archive_sessions s ON s.host_project_id = a.host_project_id AND s.archive_id = a.archive_id
      WHERE a.claim_id = ? AND a.phase = 'restoring' AND s.session_id = ? AND s.root_session_id = ?`).get(
      EntityIdSchema.parse(claimId),
      rootSessionId,
      rootSessionId,
    );
    const row = raw ? ArchiveRelocationOwnerRowSchema.safeParse(raw).data : null;
    if (!row || row.sourceWorkspaceId !== sourceWorkspaceId || row.targetWorkspaceId !== destinationWorkspaceId) {
      throw new MetadataWriteError('Archive relocation is outside its claimed session and target');
    }
  };
  const captureDirectory = async (directory: string): Promise<string> => {
    const realDirectory = await fsPromises.realpath(directory);
    if (!(await fsPromises.stat(realDirectory)).isDirectory()) {
      throw new MetadataWriteError('Canonical Host scope requires an existing directory');
    }
    return realDirectory;
  };
  const ensureWorkspace = (input: WorkspaceScopeInput): Promise<HostWorkspaceScopeRecord> => lifecycle.run(async () => {
    try {
      const selected = WorkspaceInputSchema.safeParse(input);
      if (!selected.success) throw new MetadataWriteError('Canonical workspace registration has an invalid shape');
      const value = selected.data;
      const [projectDirectory, cwd, agentDirectory] = await Promise.all([
        captureDirectory(value.projectDirectory),
        captureDirectory(value.workspaceDirectory),
        captureDirectory(value.agentDirectory),
      ]);
      return withTransaction(db, () => {
        assertWorktreeScopeAvailable(cwd);
        const rawProjectRow = db.prepare(`SELECT ${projectColumns} FROM host_agent_projects p WHERE p.directory = ?`).get(projectDirectory);
        const parsedProject = rawProjectRow ? parseRow(ProjectRowSchema, rawProjectRow) : null;
        const projectId = value.projectId ?? (parsedProject ? parsedProject.projectId : `pro_${randomUUID()}`);
        if (parsedProject && parsedProject.projectId !== projectId) throw new MetadataWriteError('A project directory cannot change its canonical identity');
        if (!parsedProject) {
          db.prepare('INSERT INTO host_agent_projects (project_id, host_project_id, directory, name, display_path) VALUES (?, ?, ?, ?, ?)')
            .run(projectId, value.hostProjectId, projectDirectory, value.name, value.displayPath ?? null);
        } else {
          db.prepare('UPDATE host_agent_projects SET name = ?, display_path = ? WHERE project_id = ?')
            .run(value.name, value.displayPath ?? parsedProject.displayPath, projectId);
        }
        const existingRaw = db.prepare('SELECT workspace_id FROM host_agent_workspaces WHERE project_id = ? AND cwd = ?').get(projectId, cwd);
        if (existingRaw) {
          const existing = WorkspaceIdRowSchema.parse(existingRaw);
          const scope = readWorkspace(existing.workspace_id);
          if (!scope) throw new MetadataCorruptError('Canonical workspace refers to a missing scope owner');
          if (scope.agentDirectory !== agentDirectory || (value.workspaceId && scope.workspaceId !== value.workspaceId)) {
            throw new MetadataWriteError('An existing workspace cannot change its selected Host identity');
          }
          return scope;
        }
        const directoryRaw = db.prepare('SELECT agent_directory_id FROM host_agent_directories WHERE directory = ?').get(agentDirectory);
        const agentDirectoryId = directoryRaw ? EntityIdSchema.parse(AgentDirectoryIdRowSchema.parse(directoryRaw).agent_directory_id) : `agd_${randomUUID()}`;
        if (!directoryRaw) db.prepare('INSERT INTO host_agent_directories (agent_directory_id, directory) VALUES (?, ?)').run(agentDirectoryId, agentDirectory);
        const workspaceId = value.workspaceId ?? `ws_${randomUUID()}`;
        if (db.prepare('SELECT workspace_id FROM host_agent_workspaces WHERE workspace_id = ?').get(workspaceId)) {
          throw new MetadataWriteError('The requested canonical workspace identity is already assigned');
        }
        db.prepare('INSERT INTO host_agent_workspaces (workspace_id, project_id, cwd, agent_directory_id) VALUES (?, ?, ?, ?)')
          .run(workspaceId, projectId, cwd, agentDirectoryId);
        const created = readWorkspace(workspaceId);
        if (!created) throw new MetadataCorruptError('Canonical workspace could not be read after insert');
        return created;
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const getWorkspace = (workspaceId: string): Promise<HostWorkspaceScopeRecord | null> => lifecycle.run(() => {
    try { return readWorkspace(EntityIdSchema.parse(workspaceId)); } catch (error) { throw readFailure(error instanceof Error ? error : String(error)); }
  });
  const getSession = (sessionId: string): Promise<HostSessionScopeRecord | null> => lifecycle.run(() => {
    try { return readSession(EntityIdSchema.parse(sessionId)); } catch (error) { throw readFailure(error instanceof Error ? error : String(error)); }
  });
  const bindSession = (input: SessionScopeInput): Promise<HostSessionScopeRecord> => lifecycle.run(() => {
    try {
      const parsed = SessionInputSchema.safeParse(input);
      if (!parsed.success) throw new MetadataWriteError('Canonical session binding has an invalid shape');
      const value = parsed.data;
      return withTransaction(db, () => {
        const workspace = readWorkspace(value.workspaceId);
        if (!workspace || (value.agentDirectoryId && value.agentDirectoryId !== workspace.agentDirectoryId)) {
          throw new MetadataWriteError('Canonical session workspace does not match its selected agent directory');
        }
        assertWorktreeScopeAvailable(workspace.cwd);
        const existing = readSession(value.sessionId);
        if (existing) {
          if (existing.rootSessionId !== value.rootSessionId || existing.workspaceId !== value.workspaceId
            || existing.agentDirectoryId !== workspace.agentDirectoryId) {
            throw new MetadataWriteError('An admitted session cannot change its captured Host scope');
          }
          return existing;
        }
        if (value.rootSessionId !== value.sessionId) {
          const root = readSession(value.rootSessionId);
          if (!root || root.rootSessionId !== value.rootSessionId || root.workspaceId !== value.workspaceId
            || root.agentDirectoryId !== workspace.agentDirectoryId) {
            throw new MetadataWriteError('A child session must retain its admitted root scope');
          }
        }
        db.prepare('INSERT INTO host_agent_sessions (session_id, root_session_id, workspace_id, agent_directory_id) VALUES (?, ?, ?, ?)')
          .run(value.sessionId, value.rootSessionId, value.workspaceId, workspace.agentDirectoryId);
        const created = readSession(value.sessionId);
        if (!created) throw new MetadataCorruptError('Canonical session could not be read after insert');
        return created;
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const removeSessionFamily = (rootSessionId: string): Promise<number> => lifecycle.run(() => {
    try {
      return withTransaction(db, () => {
        const id = EntityIdSchema.parse(rootSessionId);
        for (const session of readFamily(id)) assertWorktreeScopeAvailable(session.cwd);
        return Number(db.prepare('DELETE FROM host_agent_sessions WHERE root_session_id = ?').run(id).changes);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const listSessionFamily = (rootSessionId: string): Promise<HostSessionScopeRecord[]> => lifecycle.run(() => {
    try { return readFamily(EntityIdSchema.parse(rootSessionId)); } catch (error) { throw readFailure(error instanceof Error ? error : String(error)); }
  });
  const rebindSessionRoot = (sessionId: string, rootSessionId: string): Promise<HostSessionScopeRecord | null> => lifecycle.run(() => {
    try {
      const from = EntityIdSchema.parse(sessionId);
      const to = EntityIdSchema.parse(rootSessionId);
      if (from === to) throw new MetadataWriteError('A session rekey must name a new identity');
      return withTransaction(db, () => {
        const existing = readSession(from);
        if (!existing || existing.sessionId !== from) throw new MetadataWriteError('The addressed session scope is not registered');
        if (existing.rootSessionId !== from) throw new MetadataWriteError('Only a root session can be rekeyed');
        const family = readFamily(from);
        if (!family.some((member) => member.sessionId === from)) throw new MetadataWriteError('The addressed session scope is not its family root');
        if (readSession(to)) throw new MetadataWriteError('The new session identity is already registered');
        assertWorktreeScopeAvailable(existing.cwd);
        for (const member of family) if (member.sessionId !== from) {
          db.prepare('UPDATE host_agent_sessions SET root_session_id = ? WHERE session_id = ? AND root_session_id = ?')
            .run(to, member.sessionId, from);
        }
        db.prepare('UPDATE host_agent_sessions SET session_id = ?, root_session_id = ? WHERE session_id = ? AND root_session_id = ?')
          .run(to, to, from, from);
        db.prepare(`UPDATE session_metadata SET session_id = ?, payload = CASE
          WHEN json_extract(CASE WHEN json_valid(payload) THEN payload END, '$.openchamber.multirun.sessionID') = ?
          THEN json_set(payload, '$.openchamber.multirun.sessionID', ?)
          ELSE payload END WHERE session_id = ?`).run(to, from, to, from);
        return readSession(to);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const getRelocation = (rootSessionId: string): Promise<SessionRelocationRecord | null> => lifecycle.run(() => {
    try { return readRelocation(EntityIdSchema.parse(rootSessionId)); } catch (error) { throw readFailure(error instanceof Error ? error : String(error)); }
  });
  const createRelocation = (input: SessionRelocationRecord, claimId?: string): Promise<SessionRelocationRecord> => lifecycle.run(() => {
    try {
      const value = RelocationSchema.parse(input);
      return withTransaction(db, () => {
        matchingFamily(value.rootSessionId, value.sourceWorkspaceId);
        assertArchiveRelocationOwner(claimId, value.rootSessionId, value.sourceWorkspaceId, value.destinationWorkspaceId);
        const source = readWorkspace(value.sourceWorkspaceId);
        const destination = readWorkspace(value.destinationWorkspaceId);
        if (!source || !destination || source.projectId !== destination.projectId || source.agentDirectoryId !== destination.agentDirectoryId) {
          throw new MetadataWriteError('Canonical relocation destination does not match its source owner');
        }
        assertWorktreeScopeAvailable(source.cwd, claimId);
        assertWorktreeScopeAvailable(destination.cwd, claimId);
        const existing = readRelocation(value.rootSessionId);
        if (existing) { matchingRelocation(value); return existing; }
        db.prepare('INSERT INTO host_agent_relocations (root_session_id, transaction_id, source_workspace_id, destination_workspace_id) VALUES (?, ?, ?, ?)')
          .run(value.rootSessionId, value.transactionId, value.sourceWorkspaceId, value.destinationWorkspaceId);
        return value;
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const moveFamily = (input: SessionRelocationRecord, rollback: boolean, claimId?: string): Promise<HostSessionScopeRecord[]> => lifecycle.run(() => {
    try {
      return withTransaction(db, () => {
        const value = matchingRelocation(input);
        assertArchiveRelocationOwner(claimId, value.rootSessionId, value.sourceWorkspaceId, value.destinationWorkspaceId);
        const from = rollback ? value.destinationWorkspaceId : value.sourceWorkspaceId;
        const to = rollback ? value.sourceWorkspaceId : value.destinationWorkspaceId;
        const family = matchingFamily(value.rootSessionId, from);
        const source = readWorkspace(from);
        const destination = readWorkspace(to);
        if (!source || !destination || source.projectId !== destination.projectId || source.agentDirectoryId !== destination.agentDirectoryId) {
          throw new MetadataWriteError('Canonical relocation destination does not match its source owner');
        }
        assertWorktreeScopeAvailable(source.cwd, claimId);
        assertWorktreeScopeAvailable(destination.cwd, claimId);
        const changed = db.prepare('UPDATE host_agent_sessions SET workspace_id = ?, agent_directory_id = ? WHERE root_session_id = ? AND workspace_id = ? AND agent_directory_id = ?')
          .run(to, destination.agentDirectoryId, value.rootSessionId, from, source.agentDirectoryId);
        if (changed.changes !== family.length) throw new MetadataWriteError('Canonical relocation Host family changed during compare-and-set');
        return readFamily(value.rootSessionId);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const rebindSessionFamily = (input: SessionRelocationRecord, claimId?: string): Promise<HostSessionScopeRecord[]> => moveFamily(input, false, claimId);
  const rollbackSessionFamily = (input: SessionRelocationRecord, claimId?: string): Promise<HostSessionScopeRecord[]> => moveFamily(input, true, claimId);
  const clearRelocation = (input: SessionRelocationRecord): Promise<void> => lifecycle.run(() => {
    try {
      return withTransaction(db, () => {
        const value = matchingRelocation(input);
        db.prepare('DELETE FROM host_agent_relocations WHERE root_session_id = ? AND transaction_id = ?').run(value.rootSessionId, value.transactionId);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const readWorktreeArchive = (key: WorktreeArchiveKey): WorktreeArchiveBinding | null => {
    const value = WorktreeArchiveKeySchema.parse(key);
    const rawBinding = db.prepare(`SELECT host_project_id AS hostProjectId, archive_id AS archiveId,
      archive_ref AS archiveRef, snapshot_commit AS snapshotCommit, project_id AS projectId,
      anchor_workspace_id AS anchorWorkspaceId, phase, revision, claim_id AS claimId,
      claim_generation AS claimGeneration, target_workspace_id AS targetWorkspaceId,
      preapply_head AS preapplyHead, preapply_fingerprint AS preapplyFingerprint,
      expected_fingerprint AS expectedFingerprint, apply_attempted AS applyAttempted,
      branch_name AS branchName, branch_oid AS branchOid, delete_branch_requested AS deleteBranchRequested, delete_cas_completed AS deleteCasCompleted, restore_cas_started AS restoreCasStarted, restore_cas_completed AS restoreCasCompleted FROM host_worktree_archives
      WHERE host_project_id = ? AND archive_id = ?`).get(value.hostProjectId, value.archiveId);
    if (!rawBinding) return null;
    const binding = parseRow(WorktreeArchiveBindingRowSchema, rawBinding);
    const anchor = readWorkspace(binding.anchorWorkspaceId);
    if (!anchor) throw new MetadataCorruptError('Archive anchor workspace is missing');
    const rawSessions = db.prepare(`SELECT session_id AS sessionId, root_session_id AS rootSessionId,
      workspace_id AS workspaceId, agent_directory_id AS agentDirectoryId,
      original_archive_revision AS originalArchiveRevision, original_archived_at AS originalArchivedAt,
      expected_archive_revision AS expectedArchiveRevision, target_workspace_id AS targetWorkspaceId, progress, delete_operation_id AS deleteOperationId
      FROM host_worktree_archive_sessions WHERE host_project_id = ? AND archive_id = ? ORDER BY session_id`)
      .all(value.hostProjectId, value.archiveId);
    const sessions = rawSessions.map((row) => parseRow(WorktreeArchiveSessionRowSchema, row));
    return { ...binding, anchorDirectory: anchor.cwd, sessions };
  };
  const listCheckoutSessions = (anchor: HostWorkspaceScopeRecord): HostSessionScopeRecord[] => {
    const rows = db.prepare(`SELECT s.session_id AS sessionId
      FROM host_agent_sessions s JOIN host_agent_workspaces w ON w.workspace_id = s.workspace_id
      WHERE w.project_id = ? ORDER BY s.session_id`).all(anchor.projectId);
    const result: HostSessionScopeRecord[] = [];
    for (const raw of rows) {
      const { sessionId } = SessionIdCamelRowSchema.parse(raw);
      const session = readSession(sessionId);
      if (session && session.hostProjectId === anchor.hostProjectId && isInsideOrSame(anchor.cwd, session.cwd)) {
        result.push(session);
      }
    }
    return result;
  };
  const createWorktreeArchive = (input: WorktreeArchiveCreateInput): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveCreateSchema.parse(input);
      if (value.archiveRef !== `refs/openchamber/archive/${value.archiveId}`) {
        throw new MetadataWriteError('Archive ref does not match its identity');
      }
      return withTransaction(db, () => {
        const anchor = readWorkspace(value.anchorWorkspaceId);
        if (!anchor || anchor.hostProjectId !== value.hostProjectId) {
          throw new MetadataWriteError('Archive anchor is outside its Host project');
        }
        const key = { hostProjectId: value.hostProjectId, archiveId: value.archiveId };
        const existing = readWorktreeArchive(key);
        if (existing) {
          if (existing.archiveRef !== value.archiveRef || existing.snapshotCommit !== value.snapshotCommit
            || existing.anchorWorkspaceId !== value.anchorWorkspaceId || existing.claimId !== value.claimId) {
            throw new MetadataWriteError('Archive identity is already bound to another operation');
          }
          return existing;
        }
        assertNoPendingScopeMutation(anchor.cwd);
        assertWorktreeScopeAvailable(anchor.cwd, undefined, true);
        db.prepare(`INSERT INTO host_worktree_archives
          (host_project_id, archive_id, archive_ref, snapshot_commit, project_id, anchor_workspace_id,
           phase, revision, claim_id, claim_generation, branch_name, branch_oid)
          VALUES (?, ?, ?, ?, ?, ?, 'capturing', 1, ?, ?, ?, ?)`)
          .run(value.hostProjectId, value.archiveId, value.archiveRef, value.snapshotCommit, anchor.projectId,
            anchor.workspaceId, value.claimId, value.claimGeneration, value.branchName, value.branchOid);
        const insert = db.prepare(`INSERT INTO host_worktree_archive_sessions
          (host_project_id, archive_id, session_id, root_session_id, workspace_id, agent_directory_id,
           original_archive_revision, original_archived_at, progress) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`);
        for (const session of listCheckoutSessions(anchor)) {
          const rawArchive = db.prepare('SELECT revision, archived_at FROM session_archive WHERE session_id = ?').get(session.sessionId);
          const archive = rawArchive ? SessionArchiveRowSchema.parse(rawArchive) : null;
          insert.run(value.hostProjectId, value.archiveId, session.sessionId, session.rootSessionId,
            session.workspaceId, session.agentDirectoryId, archive ? String(archive.revision) : null, archive?.archived_at ?? null);
        }
        return readWorktreeArchive(key);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const reserveSessionDelete = (sessionId: string): Promise<string> => lifecycle.run(() => {
    const id = EntityIdSchema.parse(sessionId);
    const session = readSession(id);
    if (!session) throw new MetadataWriteError('Session scope is unavailable');
    assertWorktreeScopeAvailable(session.cwd);
    if (pendingSessionDeletes.has(session.rootSessionId)) throw new MetadataWriteError('Session deletion is already in progress');
    pendingSessionDeletes.set(session.rootSessionId, session.cwd);
    return session.rootSessionId;
  });
  const releaseSessionDelete = (id: string): void => { pendingSessionDeletes.delete(id); };
  const reserveSessionAdmission = (
    workspaceId: string,
    operation: 'create' | 'fork' | 'reopen' | 'discovery',
    rootSessionId: string,
  ): Promise<string> => lifecycle.run(() => {
    const id = randomUUID();
    return withTransaction(db, () => {
      const workspace = readWorkspace(EntityIdSchema.parse(workspaceId));
      if (!workspace) throw new MetadataWriteError('Session admission scope is unavailable');
      assertWorktreeScopeAvailable(workspace.cwd);
      for (const raw of db.prepare('SELECT admission_id AS id, workspace_id AS workspaceId FROM host_session_admissions').all()) {
        const pending = z.object({ id: z.string(), workspaceId: z.string() }).parse(raw);
        const owner = readWorkspace(pending.workspaceId);
        if (!owner || (!liveAdmissions.has(pending.id) && scopesOverlap(workspace.cwd, owner.cwd))) {
          throw Object.assign(new MetadataWriteError('A prior native session admission requires recovery before another admission'), { code: 'COMMAND_IN_FLIGHT', status: 409 });
        }
      }
      const kind = z.enum(['create', 'fork', 'reopen', 'discovery']).parse(operation);
      if (kind === 'discovery') pendingDiscoveries.set(id, workspace.cwd);
      else {
        db.prepare('INSERT INTO host_session_admissions (admission_id, workspace_id, operation, root_session_id) VALUES (?, ?, ?, ?)')
          .run(id, workspace.workspaceId, kind, EntityIdSchema.parse(rootSessionId));
      }
      if (kind !== 'discovery') liveAdmissions.add(id);
      return id;
    });
  });
  const releaseSessionAdmission = (id: string): Promise<void> => lifecycle.run(() => {
    if (pendingDiscoveries.delete(id)) return;
    db.prepare('DELETE FROM host_session_admissions WHERE admission_id = ?').run(EntityIdSchema.parse(id));
    liveAdmissions.delete(id);
    uncertainAdmissions.delete(id);
    answeredAdmissions.delete(id);
  });
  const markSessionAdmissionUncertain = (id: string, answered = false): void => {
    liveAdmissions.delete(id);
    uncertainAdmissions.add(id);
    if (answered) answeredAdmissions.add(id);
  };
  const listPriorSessionAdmissions = (workspaceId: string): Promise<Array<{ id: string; workspaceId: string; rootSessionId: string }>> => lifecycle.run(() => {
    const workspace = readWorkspace(EntityIdSchema.parse(workspaceId));
    if (!workspace) return [];
    const rows = db.prepare("SELECT admission_id AS id, workspace_id AS workspaceId, root_session_id AS rootSessionId FROM host_session_admissions WHERE operation IN ('create', 'reopen')").all();
    return rows
      .map((raw) => PriorAdmissionRowSchema.parse(raw))
      .filter((row) => {
        if (liveAdmissions.has(row.id) || (uncertainAdmissions.has(row.id) && !answeredAdmissions.has(row.id))) return false;
        const owner = readWorkspace(row.workspaceId);
        return Boolean(owner && scopesOverlap(workspace.cwd, owner.cwd));
      });
  });
  const getWorktreeArchive = (key: WorktreeArchiveKey): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try { return readWorktreeArchive(key); } catch (error) { throw readFailure(error instanceof Error ? error : String(error)); }
  });
  const claimWorktreeArchive = (
    key: WorktreeArchiveKey,
    { claimId, claimGeneration, revision, phase }: ClaimWorktreeArchiveInput,
  ): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      const id = EntityIdSchema.parse(claimId);
      const generation = EntityIdSchema.parse(claimGeneration);
      const nextPhase = z.enum(['restoring', 'deleting']).parse(phase);
      return withTransaction(db, () => {
        const binding = readWorktreeArchive(value);
        if (!binding || binding.revision !== revision || !['archived', 'partial', nextPhase, 'finalizing', 'removal_pending'].includes(binding.phase)
          || (binding.phase === 'removal_pending' && nextPhase !== 'restoring' && nextPhase !== 'deleting')) {
          throw new MetadataWriteError('Archive claim or revision is stale');
        }
        if (binding.phase === 'removal_pending') {
          const match = /^host_(\d+)_/.exec(binding.claimGeneration ?? '');
          const pid = match ? Number(match[1]) : 0;
          if (!Number.isSafeInteger(pid) || pid <= 0) throw new MetadataWriteError('Archive removal owner cannot be verified');
          try { process.kill(pid, 0); throw new MetadataWriteError('Archive removal owner is still alive'); } catch (error) {
            const code = ErrorCodeSchema.safeParse(error);
            if (!code.success || code.data.code !== 'ESRCH') throw error;
          }
          const source = readWorkspace(binding.anchorWorkspaceId);
          const pending = CountRowSchema.parse(
            db.prepare("SELECT COUNT(*) AS count FROM host_worktree_archive_sessions WHERE host_project_id = ? AND archive_id = ? AND progress NOT IN ('archived', 'deleted', 'skipped') AND original_archived_at IS NULL")
              .get(value.hostProjectId, value.archiveId),
          );
          if (!source || fs.existsSync(source.cwd) || pending.count !== 0) throw new MetadataWriteError('Archive removal outcome is not recoverable');
        }
        const source = readWorkspace(binding.anchorWorkspaceId);
        const target = binding.targetWorkspaceId ? readWorkspace(binding.targetWorkspaceId) : null;
        if ((!source && binding.phase !== 'removal_pending') || (binding.targetWorkspaceId && !target)) throw new MetadataWriteError('Archive scope is unavailable');
        if (source) assertNoPendingScopeMutation(source.cwd, binding);
        if (target) assertNoPendingScopeMutation(target.cwd, binding);
        if (binding.claimId !== null) {
          const match = /^host_(\d+)_/.exec(binding.claimGeneration ?? '');
          const pid = match ? Number(match[1]) : 0;
          if (!Number.isSafeInteger(pid) || pid <= 0) throw new MetadataWriteError('Archive claim owner cannot be verified');
          try { process.kill(pid, 0); throw new MetadataWriteError('Archive claim owner is still alive'); } catch (error) {
            const code = ErrorCodeSchema.safeParse(error);
            if (!code.success || code.data.code !== 'ESRCH') throw error;
          }
        }
        const updated = db.prepare(`UPDATE host_worktree_archives SET claim_id = ?, claim_generation = ?, phase = ?, revision = revision + 1
          WHERE host_project_id = ? AND archive_id = ? AND revision = ? AND claim_id IS ?`)
          .run(id, generation, binding.phase === 'finalizing' && nextPhase === 'restoring' ? 'finalizing' : nextPhase, value.hostProjectId, value.archiveId, revision, binding.claimId);
        if (updated.changes !== 1) throw new MetadataWriteError('Archive claim or revision is stale');
        return readWorktreeArchive(value);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const pinWorktreeRestore = (
    key: WorktreeArchiveKey,
    { claimId, revision, targetWorkspaceId, preapplyHead, preapplyFingerprint, expectedFingerprint, recovery = false }: PinWorktreeRestoreInput,
  ): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      const id = EntityIdSchema.parse(claimId);
      const targetId = EntityIdSchema.parse(targetWorkspaceId);
      const head = z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/).parse(preapplyHead);
      const before = RestoreFingerprintSchema.parse(preapplyFingerprint);
      const expected = RestoreFingerprintSchema.parse(expectedFingerprint);
      if (before.head !== head || expected.head !== head) throw new MetadataWriteError('Restore fingerprints do not match target HEAD');
      return withTransaction(db, () => {
        const binding = readWorktreeArchive(value);
        const source = binding ? readWorkspace(binding.anchorWorkspaceId) : null;
        const target = readWorkspace(targetId);
        if (!binding || binding.claimId !== id || binding.revision !== revision || binding.phase !== 'restoring'
          || (!recovery && binding.targetWorkspaceId !== null) || !source || !target || source.projectId !== target.projectId
          || source.agentDirectoryId !== target.agentDirectoryId
          || (recovery && (!binding.targetWorkspaceId || binding.targetWorkspaceId === targetId || binding.preapplyHead !== head
            || binding.preapplyFingerprint !== JSON.stringify(before) || binding.expectedFingerprint !== JSON.stringify(expected)
            || binding.sessions.some((item) => ['move_intent', 'restored'].includes(item.progress))))) {
          throw new MetadataWriteError('Restore target or archive claim is stale');
        }
        assertNoPendingScopeMutation(target.cwd);
        assertWorktreeScopeAvailable(target.cwd, id, true);
        const updated = db.prepare(`UPDATE host_worktree_archives SET target_workspace_id = ?, preapply_head = ?,
          preapply_fingerprint = ?, expected_fingerprint = ?, apply_attempted = 0, revision = revision + 1
          WHERE host_project_id = ? AND archive_id = ? AND claim_id = ? AND revision = ? AND target_workspace_id IS ?`)
          .run(targetId, head, JSON.stringify(before), JSON.stringify(expected), value.hostProjectId, value.archiveId, id, revision, binding.targetWorkspaceId);
        if (updated.changes !== 1) throw new MetadataWriteError('Restore target or archive claim is stale');
        return readWorktreeArchive(value);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const markWorktreeRestoreAttempted = (key: WorktreeArchiveKey, claimId: string, revision: number): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      return withTransaction(db, () => {
        const result = db.prepare(`UPDATE host_worktree_archives SET apply_attempted = 1, revision = revision + 1
          WHERE host_project_id = ? AND archive_id = ? AND claim_id = ? AND revision = ?
            AND phase = 'restoring' AND target_workspace_id IS NOT NULL AND apply_attempted = 0`)
          .run(value.hostProjectId, value.archiveId, EntityIdSchema.parse(claimId), revision);
        if (result.changes !== 1) throw new MetadataWriteError('Restore attempt or archive claim is stale');
        return readWorktreeArchive(value);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const releaseWorktreeArchiveClaim = (key: WorktreeArchiveKey, claimId: string): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      return withTransaction(db, () => {
        db.prepare(`UPDATE host_worktree_archives SET phase = CASE WHEN ${unpinnedRestore} THEN 'archived' ELSE phase END,
          claim_id = NULL, claim_generation = NULL, revision = revision + 1
          WHERE host_project_id = ? AND archive_id = ? AND claim_id = ?`).run(value.hostProjectId, value.archiveId, EntityIdSchema.parse(claimId));
        return readWorktreeArchive(value);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const markWorktreeRestoreMove = (key: WorktreeArchiveKey, claimId: string, rootSessionId: string): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      const root = EntityIdSchema.parse(rootSessionId);
      return withTransaction(db, () => {
        const binding = readWorktreeArchive(value);
        if (!binding || binding.claimId !== EntityIdSchema.parse(claimId) || binding.phase !== 'restoring' || !binding.targetWorkspaceId) {
          throw new MetadataWriteError('Restore claim is stale');
        }
        const rows = binding.sessions.filter((item) => item.rootSessionId === root);
        if (!rows.length || rows.some((item) => !['pending', 'archived', 'move_intent'].includes(item.progress))) {
          throw new MetadataWriteError('Restore family progress changed');
        }
        db.prepare("UPDATE host_worktree_archive_sessions SET progress = 'move_intent' WHERE host_project_id = ? AND archive_id = ? AND root_session_id = ?")
          .run(value.hostProjectId, value.archiveId, root);
        db.prepare('UPDATE host_worktree_archives SET revision = revision + 1 WHERE host_project_id = ? AND archive_id = ?').run(value.hostProjectId, value.archiveId);
        return readWorktreeArchive(value);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const completeWorktreeRestoreFamily = (key: WorktreeArchiveKey, claimId: string, rootSessionId: string): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      const root = EntityIdSchema.parse(rootSessionId);
      return withTransaction(db, () => {
        const binding = readWorktreeArchive(value);
        if (!binding || binding.claimId !== EntityIdSchema.parse(claimId) || binding.phase !== 'restoring' || !binding.targetWorkspaceId) {
          throw new MetadataWriteError('Restore claim is stale');
        }
        const captured = binding.sessions.filter((item) => item.rootSessionId === root);
        const family = readFamily(root);
        if (!captured.length || family.length !== captured.length || captured.some((item) => {
          const scope = family.find((member) => member.sessionId === item.sessionId);
          return !scope || scope.workspaceId !== binding.targetWorkspaceId || scope.projectId !== binding.projectId || scope.agentDirectoryId !== item.agentDirectoryId;
        })) throw new MetadataWriteError('Restored session family does not match its Host target');
        for (const item of captured) {
          if (item.progress === 'restored') continue;
          const rawCurrent = db.prepare('SELECT revision, archived_at FROM session_archive WHERE session_id = ?').get(item.sessionId);
          const current = rawCurrent ? SessionArchiveRowSchema.parse(rawCurrent) : null;
          const expected = item.expectedArchiveRevision ?? item.originalArchiveRevision;
          const restoredAlone = current?.archived_at == null;
          if (!restoredAlone && String(current.revision) !== expected) {
            throw new MetadataWriteError('Restored session archive state changed');
          }
          if (!restoredAlone && item.originalArchivedAt === null) {
            const updated = db.prepare('UPDATE session_archive SET archived_at = NULL, revision = revision + 1 WHERE session_id = ? AND revision = ? AND archived_at IS NOT NULL')
              .run(item.sessionId, expected);
            if (updated.changes !== 1) throw new MetadataWriteError('Restored session archive state changed');
          } else if (!restoredAlone && current.archived_at !== item.originalArchivedAt) {
            throw new MetadataWriteError('Previously archived session changed');
          }
          db.prepare(`UPDATE host_worktree_archive_sessions SET progress = 'restored', target_workspace_id = ?
            WHERE host_project_id = ? AND archive_id = ? AND session_id = ?`)
            .run(binding.targetWorkspaceId, value.hostProjectId, value.archiveId, item.sessionId);
        }
        db.prepare('UPDATE host_worktree_archives SET revision = revision + 1 WHERE host_project_id = ? AND archive_id = ?').run(value.hostProjectId, value.archiveId);
        return readWorktreeArchive(value);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const reserveWorktreeArchiveDeleteFamily = (key: WorktreeArchiveKey, claimId: string, rootSessionId: string): Promise<ReserveWorktreeArchiveDeleteResult> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      const root = EntityIdSchema.parse(rootSessionId);
      return withTransaction(db, () => {
        const binding = readWorktreeArchive(value);
        if (!binding || binding.claimId !== EntityIdSchema.parse(claimId) || binding.phase !== 'deleting') throw new MetadataWriteError('Delete claim is stale');
        const captured = binding.sessions.filter((item) => item.rootSessionId === root);
        const firstCaptured = captured[0];
        if (!firstCaptured) throw new MetadataWriteError('Delete family is not bound');
        if (captured.some((item) => item.progress === 'delete_intent')) {
          const operationId = firstCaptured.deleteOperationId;
          if (!operationId || captured.some((item) => item.progress !== 'delete_intent' || item.deleteOperationId !== operationId)) {
            throw new MetadataWriteError('Native deletion intent is inconsistent');
          }
          return { action: 'delete', binding, operationId };
        }
        if (captured.every((item) => item.progress === 'deleted' || item.progress === 'skipped')) return { action: 'done', binding };
        const family = readFamily(root);
        const eligible = family.length === captured.length && captured.every((item) => {
          const scope = family.find((member) => member.sessionId === item.sessionId);
          const rawState = db.prepare('SELECT revision, archived_at FROM session_archive WHERE session_id = ?').get(item.sessionId);
          const state = rawState ? SessionArchiveRowSchema.parse(rawState) : null;
          const other = db.prepare('SELECT 1 FROM host_worktree_archive_sessions WHERE session_id = ? AND NOT (host_project_id = ? AND archive_id = ?) LIMIT 1')
            .get(item.sessionId, value.hostProjectId, value.archiveId);
          return scope && scope.projectId === binding.projectId && scope.workspaceId === item.workspaceId && scope.agentDirectoryId === item.agentDirectoryId
            && state?.archived_at != null && String(state.revision) === (item.expectedArchiveRevision ?? item.originalArchiveRevision) && !other;
        });
        const progress = eligible ? 'delete_intent' : 'skipped';
        const operationId = eligible ? randomUUID() : null;
        db.prepare('UPDATE host_worktree_archive_sessions SET progress = ?, delete_operation_id = ? WHERE host_project_id = ? AND archive_id = ? AND root_session_id = ?')
          .run(progress, operationId, value.hostProjectId, value.archiveId, root);
        db.prepare('UPDATE host_worktree_archives SET revision = revision + 1 WHERE host_project_id = ? AND archive_id = ?').run(value.hostProjectId, value.archiveId);
        return { action: eligible ? 'delete' : 'skip', binding: readWorktreeArchive(value), operationId };
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const completeWorktreeArchiveDeleteFamily = (key: WorktreeArchiveKey, claimId: string, rootSessionId: string, deletedIds: string[]): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      const root = EntityIdSchema.parse(rootSessionId);
      const ids = z.array(EntityIdSchema).parse(deletedIds).sort();
      return withTransaction(db, () => {
        const binding = readWorktreeArchive(value);
        if (!binding || binding.claimId !== EntityIdSchema.parse(claimId) || binding.phase !== 'deleting') throw new MetadataWriteError('Delete claim is stale');
        const rows = binding.sessions.filter((item) => item.rootSessionId === root);
        if (!rows.length || rows.some((item) => item.progress !== 'delete_intent') || JSON.stringify(rows.map((item) => item.sessionId).sort()) !== JSON.stringify(ids)) {
          throw new MetadataWriteError('Native deletion acknowledgement does not match the captured family');
        }
        db.prepare("UPDATE host_worktree_archive_sessions SET progress = 'deleted' WHERE host_project_id = ? AND archive_id = ? AND root_session_id = ?")
          .run(value.hostProjectId, value.archiveId, root);
        db.prepare('DELETE FROM host_agent_sessions WHERE root_session_id = ?').run(root);
        db.prepare('UPDATE host_worktree_archives SET revision = revision + 1 WHERE host_project_id = ? AND archive_id = ?').run(value.hostProjectId, value.archiveId);
        return readWorktreeArchive(value);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const recheckWorktreeArchive = (key: WorktreeArchiveKey, claimId: string): Promise<WorktreeArchiveBinding> => lifecycle.run(() => {
    try {
      return withTransaction(db, () => {
        const binding = readWorktreeArchive(key);
        if (!binding || binding.claimId !== EntityIdSchema.parse(claimId)) throw new MetadataWriteError('Archive claim is stale');
        const anchor = readWorkspace(binding.anchorWorkspaceId);
        if (!anchor) throw new MetadataCorruptError('Archive anchor is missing');
        const current = listCheckoutSessions(anchor);
        if (current.length !== binding.sessions.length || current.some((session, index) => {
          const captured = binding.sessions[index];
          if (!captured) return true;
          const rawState = db.prepare('SELECT revision, archived_at FROM session_archive WHERE session_id = ?').get(session.sessionId);
          const state = rawState ? SessionArchiveRowSchema.parse(rawState) : null;
          const expectedRevision = captured.expectedArchiveRevision ?? captured.originalArchiveRevision;
          return session.sessionId !== captured.sessionId || session.rootSessionId !== captured.rootSessionId
            || session.workspaceId !== captured.workspaceId || session.agentDirectoryId !== captured.agentDirectoryId
            || (state ? String(state.revision) : null) !== expectedRevision
            || (captured.progress === 'archived' ? state?.archived_at == null : (state?.archived_at ?? null) !== captured.originalArchivedAt);
        })) throw new MetadataWriteError('The archive session scope or state changed');
        return binding;
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const setWorktreeArchivePhase = (key: WorktreeArchiveKey, claimId: string, revision: number, phase: string): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      const allowed = z.enum(['archiving', 'removal_pending', 'archived', 'partial', 'restoring', 'deleting', 'finalizing']).parse(phase);
      return withTransaction(db, () => {
        const result = db.prepare(`UPDATE host_worktree_archives SET phase = ?, revision = revision + 1
          WHERE host_project_id = ? AND archive_id = ? AND claim_id = ? AND revision = ?`)
          .run(allowed, value.hostProjectId, value.archiveId, EntityIdSchema.parse(claimId), revision);
        if (result.changes !== 1) throw new MetadataWriteError('Archive claim or revision is stale');
        return readWorktreeArchive(value);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const archiveWorktreeSessions = (key: WorktreeArchiveKey, claimId: string, archivedAt: number): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      const timestamp = z.number().int().positive().refine(Number.isSafeInteger).parse(archivedAt);
      return withTransaction(db, () => {
        const binding = readWorktreeArchive(value);
        if (!binding || binding.claimId !== EntityIdSchema.parse(claimId) || binding.phase !== 'capturing') {
          throw new MetadataWriteError('Archive capture claim is stale');
        }
        for (const item of binding.sessions) {
          const scope = readSession(item.sessionId);
          if (!scope || scope.workspaceId !== item.workspaceId || scope.agentDirectoryId !== item.agentDirectoryId
            || scope.rootSessionId !== item.rootSessionId || scope.projectId !== binding.projectId) {
            throw new MetadataWriteError('Archive session scope changed');
          }
          const rawCurrent = db.prepare('SELECT revision, archived_at FROM session_archive WHERE session_id = ?').get(item.sessionId);
          const current = rawCurrent ? SessionArchiveRowSchema.parse(rawCurrent) : null;
          if ((current ? String(current.revision) : null) !== item.originalArchiveRevision
            || (current?.archived_at ?? null) !== item.originalArchivedAt) {
            throw new MetadataWriteError('Archive session state changed');
          }
          if (item.originalArchivedAt !== null) continue;
          db.prepare(`INSERT INTO session_archive (session_id, revision, archived_at) VALUES (?, 1, ?)
            ON CONFLICT(session_id) DO UPDATE SET revision = session_archive.revision + 1, archived_at = excluded.archived_at`)
            .run(item.sessionId, timestamp);
          const updated = RevisionOnlyRowSchema.parse(db.prepare('SELECT revision FROM session_archive WHERE session_id = ?').get(item.sessionId));
          db.prepare(`UPDATE host_worktree_archive_sessions SET progress = 'archived', expected_archive_revision = ?
            WHERE host_project_id = ? AND archive_id = ? AND session_id = ?`)
            .run(String(updated.revision), value.hostProjectId, value.archiveId, item.sessionId);
        }
        db.prepare(`UPDATE host_worktree_archives SET phase = 'archiving', revision = revision + 1
          WHERE host_project_id = ? AND archive_id = ?`).run(value.hostProjectId, value.archiveId);
        return readWorktreeArchive(value);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const rollbackWorktreeSessions = (key: WorktreeArchiveKey, claimId: string, partial: boolean): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      return withTransaction(db, () => {
        const binding = readWorktreeArchive(value);
        if (!binding || binding.claimId !== EntityIdSchema.parse(claimId)) throw new MetadataWriteError('Archive rollback claim is stale');
        for (const item of binding.sessions) {
          if (item.progress !== 'archived') continue;
          const result = db.prepare(`UPDATE session_archive SET archived_at = NULL, revision = revision + 1
            WHERE session_id = ? AND revision = ? AND archived_at IS NOT NULL`).run(item.sessionId, item.expectedArchiveRevision);
          if (result.changes !== 1) throw new MetadataWriteError('Archive rollback state changed');
          db.prepare(`UPDATE host_worktree_archive_sessions SET progress = 'pending', expected_archive_revision = NULL
            WHERE host_project_id = ? AND archive_id = ? AND session_id = ?`)
            .run(value.hostProjectId, value.archiveId, item.sessionId);
        }
        db.prepare(`UPDATE host_worktree_archives SET phase = ?, revision = revision + 1, claim_id = NULL, claim_generation = NULL
          WHERE host_project_id = ? AND archive_id = ?`).run(partial ? 'partial' : 'finalizing', value.hostProjectId, value.archiveId);
        return readWorktreeArchive(value);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const finishWorktreeArchive = (key: WorktreeArchiveKey, claimId: string): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      return withTransaction(db, () => {
        const result = db.prepare(`UPDATE host_worktree_archives SET phase = 'archived', revision = revision + 1,
          claim_id = NULL, claim_generation = NULL WHERE host_project_id = ? AND archive_id = ?
          AND claim_id = ? AND phase = 'removal_pending'`)
          .run(value.hostProjectId, value.archiveId, EntityIdSchema.parse(claimId));
        if (result.changes !== 1) throw new MetadataWriteError('Archive completion claim is stale');
        return readWorktreeArchive(value);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const markWorktreeArchiveDeleteFinalizing = (key: WorktreeArchiveKey, claimId: string, revision: number, deleteBranch: boolean): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      return withTransaction(db, () => {
        const result = db.prepare(`UPDATE host_worktree_archives SET phase = 'finalizing', delete_branch_requested = ?, revision = revision + 1
          WHERE host_project_id = ? AND archive_id = ? AND claim_id = ? AND revision = ? AND phase IN ('deleting', 'finalizing')`)
          .run(deleteBranch ? 1 : 0, value.hostProjectId, value.archiveId, EntityIdSchema.parse(claimId), revision);
        if (result.changes !== 1) throw new MetadataWriteError('Archive delete finalization claim is stale');
        return readWorktreeArchive(value);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const markWorktreeArchiveDeleteCasCompleted = (key: WorktreeArchiveKey, claimId: string, revision: number): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      return withTransaction(db, () => {
        const result = db.prepare(`UPDATE host_worktree_archives SET delete_cas_completed = 1, revision = revision + 1
          WHERE host_project_id = ? AND archive_id = ? AND claim_id = ? AND revision = ? AND phase = 'finalizing'`)
          .run(value.hostProjectId, value.archiveId, EntityIdSchema.parse(claimId), revision);
        if (result.changes !== 1) throw new MetadataWriteError('Archive delete CAS completion is stale');
        return readWorktreeArchive(value);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const markWorktreeArchiveRestoreCasStarted = (key: WorktreeArchiveKey, claimId: string, revision: number): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      return withTransaction(db, () => {
        const result = db.prepare(`UPDATE host_worktree_archives SET restore_cas_started = 1, revision = revision + 1
          WHERE host_project_id = ? AND archive_id = ? AND claim_id = ? AND revision = ? AND phase = 'finalizing'`)
          .run(value.hostProjectId, value.archiveId, EntityIdSchema.parse(claimId), revision);
        if (result.changes !== 1) throw new MetadataWriteError('Archive restore CAS intent is stale');
        return readWorktreeArchive(value);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const markWorktreeArchiveRestoreCasCompleted = (key: WorktreeArchiveKey, claimId: string, revision: number): Promise<WorktreeArchiveBinding | null> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      return withTransaction(db, () => {
        const result = db.prepare(`UPDATE host_worktree_archives SET restore_cas_completed = 1, revision = revision + 1
          WHERE host_project_id = ? AND archive_id = ? AND claim_id = ? AND revision = ? AND phase = 'finalizing'`)
          .run(value.hostProjectId, value.archiveId, EntityIdSchema.parse(claimId), revision);
        if (result.changes !== 1) throw new MetadataWriteError('Archive restore CAS completion is stale');
        return readWorktreeArchive(value);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const discardWorktreeArchive = (key: WorktreeArchiveKey): Promise<void> => lifecycle.run(() => {
    try {
      const value = WorktreeArchiveKeySchema.parse(key);
      return withTransaction(db, () => {
        const binding = readWorktreeArchive(value);
        if (!binding || binding.phase !== 'finalizing' || binding.claimId !== null) {
          throw new MetadataWriteError('Archive cleanup is not authorized');
        }
        db.prepare('DELETE FROM host_worktree_archive_sessions WHERE host_project_id = ? AND archive_id = ?')
          .run(value.hostProjectId, value.archiveId);
        db.prepare('DELETE FROM host_worktree_archives WHERE host_project_id = ? AND archive_id = ?')
          .run(value.hostProjectId, value.archiveId);
      });
    } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const checkWorktreeScope = (directory: string, claimId?: string): Promise<void> => lifecycle.run(() => {
    try { assertWorktreeScopeAvailable(DirectorySchema.parse(directory), claimId); } catch (error) { throw writeFailure(error instanceof Error ? error : String(error)); }
  });
  const listWorkspaces = (projectId?: string): Promise<{ items: HostWorkspaceScopeRecord[]; errors: Record<string, string> }> => lifecycle.run(() => {
    try {
      const rows = projectId === undefined
        ? db.prepare('SELECT workspace_id FROM host_agent_workspaces ORDER BY workspace_id').all()
        : db.prepare('SELECT workspace_id FROM host_agent_workspaces WHERE project_id = ? ORDER BY workspace_id').all(EntityIdSchema.parse(projectId));
      const items: HostWorkspaceScopeRecord[] = [];
      const errors: Record<string, string> = {};
      for (const raw of rows) {
        const row = WorkspaceIdRowSchema.parse(raw);
        try {
          const workspace = readWorkspace(row.workspace_id);
          if (workspace) items.push(workspace);
        } catch (error) { errors[row.workspace_id] = readFailure(error instanceof Error ? error : String(error)).code; }
      }
      return { items, errors };
    } catch (error) { throw readFailure(error instanceof Error ? error : String(error)); }
  });
  const listArchivedWorktreeWorkspaces = (): Promise<string[]> => lifecycle.run(() => {
    try {
      const rows = db.prepare(`SELECT DISTINCT w.workspace_id AS workspaceId
        FROM host_agent_workspaces w
        JOIN host_worktree_archive_sessions s ON s.workspace_id = w.workspace_id
        JOIN host_worktree_archives a ON a.host_project_id = s.host_project_id AND a.archive_id = s.archive_id
        WHERE a.phase = 'archived' AND s.progress = 'archived'`).all();
      return rows.map((row) => WorkspaceCamelIdRowSchema.parse(row).workspaceId);
    } catch (error) { throw readFailure(error instanceof Error ? error : String(error)); }
  });
  const listWorkspacesWithArchivedSessions = (): Promise<string[]> => lifecycle.run(() => {
    try {
      const rows = db.prepare(`SELECT DISTINCT s.workspace_id AS workspaceId
        FROM host_agent_sessions s
        JOIN session_archive a ON a.session_id = s.session_id
        WHERE a.archived_at IS NOT NULL`).all();
      return rows.map((row) => WorkspaceCamelIdRowSchema.parse(row).workspaceId);
    } catch (error) { throw readFailure(error instanceof Error ? error : String(error)); }
  });
  const hasArchivedSessions = (workspaceId: string): Promise<boolean> => lifecycle.run(() => {
    try {
      const row = db.prepare(`SELECT 1 FROM host_agent_sessions s
        JOIN session_archive a ON a.session_id = s.session_id
        WHERE s.workspace_id = ? AND a.archived_at IS NOT NULL LIMIT 1`).get(workspaceId);
      return Boolean(row);
    } catch (error) { throw readFailure(error instanceof Error ? error : String(error)); }
  });
  const isWorktreeArchived = (workspaceId: string): Promise<boolean> => lifecycle.run(() => {
    try {
      const row = db.prepare(`SELECT 1 FROM host_worktree_archive_sessions s
        JOIN host_worktree_archives a ON a.host_project_id = s.host_project_id AND a.archive_id = s.archive_id
        WHERE s.workspace_id = ? AND a.phase = 'archived' AND s.progress = 'archived' LIMIT 1`).get(workspaceId);
      return Boolean(row);
    } catch (error) { throw readFailure(error instanceof Error ? error : String(error)); }
  });
  const listProjects = (): Promise<{ items: Project[]; errors: Record<string, string> }> => lifecycle.run(() => {
    try {
      const rows = db.prepare(`SELECT ${projectColumns} FROM host_agent_projects p ORDER BY p.name, p.project_id`).all();
      const items: Project[] = [];
      const errors: Record<string, string> = {};
      for (const row of rows) {
        const parsedId = ProjectIdOnlySchema.safeParse(row);
        const errorKey = parsedId.success ? parsedId.data.projectId : 'unknown';
        try {
          const project = parseRow(ProjectRowSchema, row);
          const workspaceIds: string[] = [];
          for (const rawWorkspace of db.prepare('SELECT workspace_id FROM host_agent_workspaces WHERE project_id = ? ORDER BY workspace_id').all(project.projectId)) {
            const workspace = WorkspaceIdRowSchema.parse(rawWorkspace);
            try {
              const resolved = readWorkspace(workspace.workspace_id);
              if (resolved) workspaceIds.push(resolved.workspaceId);
            } catch (error) { errors[workspace.workspace_id] = readFailure(error instanceof Error ? error : String(error)).code; }
          }
          const itemInput = project.displayPath === null
            ? { projectId: project.projectId, name: project.name, workspaceIds }
            : { projectId: project.projectId, name: project.name, workspaceIds, displayPath: project.displayPath };
          items.push(ProjectSchema.parse(itemInput));
        } catch (error) { errors[errorKey] = readFailure(error instanceof Error ? error : String(error)).code; }
      }
      return { items, errors };
    } catch (error) { throw readFailure(error instanceof Error ? error : String(error)); }
  });
  return {
    ensureWorkspace,
    getWorkspace,
    bindSession,
    getSession,
    removeSessionFamily,
    listSessionFamily,
    rebindSessionRoot,
    getRelocation,
    createRelocation,
    rebindSessionFamily,
    rollbackSessionFamily,
    clearRelocation,
    listProjects,
    listWorkspaces,
    listArchivedWorktreeWorkspaces,
    listWorkspacesWithArchivedSessions,
    hasArchivedSessions,
    isWorktreeArchived,
    createWorktreeArchive,
    getWorktreeArchive,
    claimWorktreeArchive,
    pinWorktreeRestore,
    markWorktreeRestoreAttempted,
    releaseWorktreeArchiveClaim,
    markWorktreeRestoreMove,
    completeWorktreeRestoreFamily,
    reserveWorktreeArchiveDeleteFamily,
    completeWorktreeArchiveDeleteFamily,
    recheckWorktreeArchive,
    setWorktreeArchivePhase,
    archiveWorktreeSessions,
    rollbackWorktreeSessions,
    finishWorktreeArchive,
    markWorktreeArchiveDeleteFinalizing,
    markWorktreeArchiveDeleteCasCompleted,
    markWorktreeArchiveRestoreCasStarted,
    markWorktreeArchiveRestoreCasCompleted,
    discardWorktreeArchive,
    checkWorktreeScope,
    assertSessionWritable,
    reserveSessionDelete,
    releaseSessionDelete,
    reserveSessionAdmission,
    releaseSessionAdmission,
    markSessionAdmissionUncertain,
    listPriorSessionAdmissions,
    close: lifecycle.close,
    flush: lifecycle.flush,
  };
};
