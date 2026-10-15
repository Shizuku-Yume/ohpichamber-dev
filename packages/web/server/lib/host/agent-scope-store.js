import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { EntityIdSchema, ProjectSchema } from '@openchamber/agent-contract';
import { MetadataCorruptError, MetadataReadError, MetadataWriteError, createMetadataLifecycle, withTransaction } from './metadata-sqlite.js';

const DirectorySchema = z.string().min(1).refine((directory) => path.isAbsolute(directory));
const WorkspaceInputSchema = z.strictObject({
  hostProjectId: EntityIdSchema,
  projectId: EntityIdSchema.optional(),
  workspaceId: EntityIdSchema.optional(),
  projectDirectory: DirectorySchema,
  workspaceDirectory: DirectorySchema,
  agentDirectory: DirectorySchema,
  name: z.string().min(1),
  displayPath: ProjectSchema.shape.displayPath,
});
const ProjectRowSchema = z.strictObject({
  projectId: EntityIdSchema, hostProjectId: EntityIdSchema,
  projectDirectory: DirectorySchema, name: z.string(),
  displayPath: ProjectSchema.shape.displayPath.unwrap().nullable(),
});
const WorkspaceRowSchema = ProjectRowSchema.extend({
  workspaceId: EntityIdSchema, cwd: DirectorySchema,
  agentDirectoryId: EntityIdSchema, agentDirectory: DirectorySchema,
});
const SessionInputSchema = z.strictObject({
  sessionId: EntityIdSchema, rootSessionId: EntityIdSchema,
  workspaceId: EntityIdSchema, agentDirectoryId: EntityIdSchema.optional(),
});
const SessionRowSchema = WorkspaceRowSchema.extend({ sessionId: EntityIdSchema, rootSessionId: EntityIdSchema });
const RelocationSchema = z.strictObject({ rootSessionId: EntityIdSchema, transactionId: EntityIdSchema, sourceWorkspaceId: EntityIdSchema, destinationWorkspaceId: EntityIdSchema });
const projectColumns = `p.project_id AS projectId, p.host_project_id AS hostProjectId,
  p.directory AS projectDirectory, p.name, p.display_path AS displayPath`;
const workspaceColumns = `${projectColumns}, w.workspace_id AS workspaceId, w.cwd,
  d.agent_directory_id AS agentDirectoryId, d.directory AS agentDirectory`;
const workspaceJoin = `host_agent_workspaces w
  JOIN host_agent_projects p ON p.project_id = w.project_id
  JOIN host_agent_directories d ON d.agent_directory_id = w.agent_directory_id`;

const parseRow = (schema, row) => {
  const parsed = schema.safeParse(row);
  if (!parsed.success) throw new MetadataCorruptError('Canonical Host scope has an invalid shape');
  return parsed.data;
};
const readFailure = (error) => error instanceof MetadataCorruptError || error instanceof MetadataReadError
  ? error : new MetadataReadError('Could not read canonical Host scope', error);
const writeFailure = (error) => error instanceof MetadataCorruptError || error instanceof MetadataWriteError
  ? error : new MetadataWriteError('Could not persist canonical Host scope', error);

/** Private directory authority. Callers authorize roots before registration; no transcript or SDK state is stored here. */
export const createAgentScopeStore = ({ database, fsPromises = fs.promises }) => {
  const db = database;
  const lifecycle = createMetadataLifecycle(db, false);
  const workspaceStatement = db.prepare(`SELECT ${workspaceColumns} FROM ${workspaceJoin} WHERE w.workspace_id = ?`);
  const sessionStatement = db.prepare(`SELECT ${workspaceColumns}, s.session_id AS sessionId, s.root_session_id AS rootSessionId
    FROM ${workspaceJoin} JOIN host_agent_sessions s ON w.workspace_id = s.workspace_id
    WHERE s.session_id = ? AND s.agent_directory_id = w.agent_directory_id`);
  const readWorkspace = (workspaceId) => {
    const row = workspaceStatement.get(workspaceId);
    if (row) return parseRow(WorkspaceRowSchema, row);
    if (db.prepare('SELECT workspace_id FROM host_agent_workspaces WHERE workspace_id = ?').get(workspaceId)) {
      throw new MetadataCorruptError('Canonical workspace refers to a missing scope owner');
    }
    return null;
  };
  const readSession = (sessionId) => {
    const row = sessionStatement.get(sessionId);
    if (row) return parseRow(SessionRowSchema, row);
    if (db.prepare('SELECT session_id FROM host_agent_sessions WHERE session_id = ?').get(sessionId)) {
      throw new MetadataCorruptError('Canonical session refers to a missing or conflicting scope owner');
    }
    return null;
  };
  const readFamily = (rootSessionId) => {
    const rows = db.prepare('SELECT session_id AS sessionId FROM host_agent_sessions WHERE root_session_id = ? ORDER BY session_id').all(rootSessionId);
    return rows.map((row) => readSession(EntityIdSchema.parse(row.sessionId)));
  };
  const readRelocation = (rootSessionId) => {
    const row = db.prepare('SELECT root_session_id AS rootSessionId, transaction_id AS transactionId, source_workspace_id AS sourceWorkspaceId, destination_workspace_id AS destinationWorkspaceId FROM host_agent_relocations WHERE root_session_id = ?').get(rootSessionId);
    return row ? parseRow(RelocationSchema, row) : null;
  };
  const matchingRelocation = (input) => {
    const value = RelocationSchema.parse(input);
    const pending = readRelocation(value.rootSessionId);
    if (!pending || pending.transactionId !== value.transactionId || pending.sourceWorkspaceId !== value.sourceWorkspaceId || pending.destinationWorkspaceId !== value.destinationWorkspaceId)
      throw new MetadataWriteError('Canonical relocation intent is stale');
    return value;
  };
  const matchingFamily = (rootSessionId, workspaceId) => {
    const family = readFamily(rootSessionId);
    if (!family.some((member) => member.sessionId === rootSessionId) || family.some((member) => member.workspaceId !== workspaceId))
      throw new MetadataWriteError('Canonical relocation family does not match its admitted Host owner');
    return family;
  };
  const captureDirectory = async (directory) => {
    const realDirectory = await fsPromises.realpath(directory);
    if (!(await fsPromises.stat(realDirectory)).isDirectory()) {
      throw new MetadataWriteError('Canonical Host scope requires an existing directory');
    }
    return realDirectory;
  };
  const ensureWorkspace = (input) => lifecycle.run(async () => {
    try {
      const selected = WorkspaceInputSchema.safeParse(input);
      if (!selected.success) throw new MetadataWriteError('Canonical workspace registration has an invalid shape');
      const value = selected.data;
      const [projectDirectory, cwd, agentDirectory] = await Promise.all([
        captureDirectory(value.projectDirectory), captureDirectory(value.workspaceDirectory), captureDirectory(value.agentDirectory),
      ]);
      return withTransaction(db, () => {
        const projectRow = db.prepare(`SELECT ${projectColumns} FROM host_agent_projects p WHERE p.directory = ?`).get(projectDirectory);
        const projectId = value.projectId ?? (projectRow ? parseRow(ProjectRowSchema, projectRow).projectId : `pro_${randomUUID()}`);
        if (projectRow && parseRow(ProjectRowSchema, projectRow).projectId !== projectId) throw new MetadataWriteError('A project directory cannot change its canonical identity');
        if (!projectRow) {
          db.prepare('INSERT INTO host_agent_projects (project_id, host_project_id, directory, name, display_path) VALUES (?, ?, ?, ?, ?)')
            .run(projectId, value.hostProjectId, projectDirectory, value.name, value.displayPath ?? null);
        } else {
          db.prepare('UPDATE host_agent_projects SET name = ?, display_path = ? WHERE project_id = ?')
            .run(value.name, value.displayPath ?? projectRow.displayPath, projectId);
        }
        const existing = db.prepare('SELECT workspace_id FROM host_agent_workspaces WHERE project_id = ? AND cwd = ?').get(projectId, cwd);
        if (existing) {
          const scope = readWorkspace(existing.workspace_id);
          if (scope.agentDirectory !== agentDirectory || (value.workspaceId && scope.workspaceId !== value.workspaceId))
            throw new MetadataWriteError('An existing workspace cannot change its selected Host identity');
          return scope;
        }
        const directoryRow = db.prepare('SELECT agent_directory_id FROM host_agent_directories WHERE directory = ?').get(agentDirectory);
        const agentDirectoryId = directoryRow ? EntityIdSchema.parse(directoryRow.agent_directory_id) : `agd_${randomUUID()}`;
        if (!directoryRow) db.prepare('INSERT INTO host_agent_directories (agent_directory_id, directory) VALUES (?, ?)').run(agentDirectoryId, agentDirectory);
        const workspaceId = value.workspaceId ?? `ws_${randomUUID()}`;
        if (db.prepare('SELECT workspace_id FROM host_agent_workspaces WHERE workspace_id = ?').get(workspaceId))
          throw new MetadataWriteError('The requested canonical workspace identity is already assigned');
        db.prepare('INSERT INTO host_agent_workspaces (workspace_id, project_id, cwd, agent_directory_id) VALUES (?, ?, ?, ?)')
          .run(workspaceId, projectId, cwd, agentDirectoryId);
        return readWorkspace(workspaceId);
      });
    } catch (error) { throw writeFailure(error); }
  });
  const getWorkspace = (workspaceId) => lifecycle.run(() => {
    try { return readWorkspace(EntityIdSchema.parse(workspaceId)); } catch (error) { throw readFailure(error); }
  });
  const getSession = (sessionId) => lifecycle.run(() => {
    try { return readSession(EntityIdSchema.parse(sessionId)); } catch (error) { throw readFailure(error); }
  });
  const bindSession = (input) => lifecycle.run(() => {
    try {
      const parsed = SessionInputSchema.safeParse(input);
      if (!parsed.success) throw new MetadataWriteError('Canonical session binding has an invalid shape');
      const value = parsed.data;
      return withTransaction(db, () => {
        const workspace = readWorkspace(value.workspaceId);
        if (!workspace || (value.agentDirectoryId && value.agentDirectoryId !== workspace.agentDirectoryId)) {
          throw new MetadataWriteError('Canonical session workspace does not match its selected agent directory');
        }
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
        return readSession(value.sessionId);
      });
    } catch (error) { throw writeFailure(error); }
  });
  const removeSessionFamily = (rootSessionId) => lifecycle.run(() => {
    try {
      return withTransaction(db, () => db.prepare('DELETE FROM host_agent_sessions WHERE root_session_id = ?').run(EntityIdSchema.parse(rootSessionId)).changes);
    } catch (error) { throw writeFailure(error); }
  });
  const listSessionFamily = (rootSessionId) => lifecycle.run(() => {
    try { return readFamily(EntityIdSchema.parse(rootSessionId)); } catch (error) { throw readFailure(error); }
  });
  const getRelocation = (rootSessionId) => lifecycle.run(() => {
    try { return readRelocation(EntityIdSchema.parse(rootSessionId)); } catch (error) { throw readFailure(error); }
  });
  const createRelocation = (input) => lifecycle.run(() => {
    try {
      const value = RelocationSchema.parse(input);
      return withTransaction(db, () => {
        matchingFamily(value.rootSessionId, value.sourceWorkspaceId);
        const source = readWorkspace(value.sourceWorkspaceId);
        const destination = readWorkspace(value.destinationWorkspaceId);
        if (!source || !destination || source.projectId !== destination.projectId || source.agentDirectoryId !== destination.agentDirectoryId)
          throw new MetadataWriteError('Canonical relocation destination does not match its source owner');
        const existing = readRelocation(value.rootSessionId);
        if (existing) { matchingRelocation(value); return existing; }
        db.prepare('INSERT INTO host_agent_relocations (root_session_id, transaction_id, source_workspace_id, destination_workspace_id) VALUES (?, ?, ?, ?)')
          .run(value.rootSessionId, value.transactionId, value.sourceWorkspaceId, value.destinationWorkspaceId);
        return value;
      });
    } catch (error) { throw writeFailure(error); }
  });
  const moveFamily = (input, rollback) => lifecycle.run(() => {
    try {
      return withTransaction(db, () => {
        const value = matchingRelocation(input);
        const from = rollback ? value.destinationWorkspaceId : value.sourceWorkspaceId;
        const to = rollback ? value.sourceWorkspaceId : value.destinationWorkspaceId;
        const family = matchingFamily(value.rootSessionId, from);
        const source = readWorkspace(from);
        const destination = readWorkspace(to);
        if (!source || !destination || source.projectId !== destination.projectId || source.agentDirectoryId !== destination.agentDirectoryId)
          throw new MetadataWriteError('Canonical relocation destination does not match its source owner');
        const changed = db.prepare('UPDATE host_agent_sessions SET workspace_id = ?, agent_directory_id = ? WHERE root_session_id = ? AND workspace_id = ? AND agent_directory_id = ?')
          .run(to, destination.agentDirectoryId, value.rootSessionId, from, source.agentDirectoryId);
        if (changed.changes !== family.length) throw new MetadataWriteError('Canonical relocation Host family changed during compare-and-set');
        return readFamily(value.rootSessionId);
      });
    } catch (error) { throw writeFailure(error); }
  });
  const rebindSessionFamily = (input) => moveFamily(input, false);
  const rollbackSessionFamily = (input) => moveFamily(input, true);
  const clearRelocation = (input) => lifecycle.run(() => {
    try {
      return withTransaction(db, () => {
        const value = matchingRelocation(input);
        db.prepare('DELETE FROM host_agent_relocations WHERE root_session_id = ? AND transaction_id = ?').run(value.rootSessionId, value.transactionId);
      });
    } catch (error) { throw writeFailure(error); }
  });
  const listWorkspaces = (projectId) => lifecycle.run(() => {
    try {
      const rows = projectId === undefined
        ? db.prepare('SELECT workspace_id FROM host_agent_workspaces ORDER BY workspace_id').all()
        : db.prepare('SELECT workspace_id FROM host_agent_workspaces WHERE project_id = ? ORDER BY workspace_id').all(EntityIdSchema.parse(projectId));
      const items = [];
      const errors = {};
      for (const row of rows) {
        try { items.push(readWorkspace(row.workspace_id)); } catch (error) { errors[row.workspace_id] = readFailure(error).code; }
      }
      return { items, errors };
    } catch (error) { throw readFailure(error); }
  });
  const listProjects = () => lifecycle.run(() => {
    try {
      const rows = db.prepare(`SELECT ${projectColumns} FROM host_agent_projects p ORDER BY p.name, p.project_id`).all();
      const items = [];
      const errors = {};
      for (const row of rows) {
        try {
          const project = parseRow(ProjectRowSchema, row);
          const workspaceIds = [];
          for (const workspace of db.prepare('SELECT workspace_id FROM host_agent_workspaces WHERE project_id = ? ORDER BY workspace_id').all(project.projectId)) {
            try { workspaceIds.push(readWorkspace(workspace.workspace_id).workspaceId); }
            catch (error) { errors[workspace.workspace_id] = readFailure(error).code; }
          }
          items.push(ProjectSchema.parse({
            projectId: project.projectId, name: project.name, workspaceIds,
            ...(project.displayPath === null ? {} : { displayPath: project.displayPath }),
          }));
        } catch (error) { errors[row.projectId] = readFailure(error).code; }
      }
      return { items, errors };
    } catch (error) { throw readFailure(error); }
  });
  return { ensureWorkspace, getWorkspace, bindSession, getSession, removeSessionFamily, listSessionFamily, getRelocation, createRelocation, rebindSessionFamily, rollbackSessionFamily, clearRelocation, listProjects, listWorkspaces, flush: lifecycle.flush, close: lifecycle.close };
};
