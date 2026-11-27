import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { ProjectSchema, RuntimeSessionSchema, type Project, type RuntimeSession, type Workspace } from '@openchamber/agent-contract';
import { MetadataReadError, MetadataWriteError, HostMetadataError } from './metadata-sqlite.js';
import type { AgentScopeStore, HostSessionScopeRecord, HostWorkspaceScopeRecord } from './agent-scope-store.js';
import type { DirectoryValidation } from '../projects/contracts.js';
import type { ScheduledChatsScope } from '../scheduled-tasks/chats-scope.js';
import type { NormalizedProject, RawValue } from '../settings/settings-normalization-runtime.js';
import type { SettingsDocument } from '../settings/settings-helpers.js';

const WorkspaceDirectorySchema = z.string().refine((directory) => Boolean(directory.trim()) && path.isAbsolute(directory.trim()));
const ErrorCodeSchema = z.object({ code: z.string() });

export interface SpaceArchiveCatalogEntry {
  spaceId: string;
  name: string;
  workspaceId: string;
  projectDirectory: string | null;
  directory: string;
  archivedAt: number;
}

export type HostDirectoryValidationResult = DirectoryValidation & {
  requestedDirectory?: string | undefined;
};

export interface HostWorktreeEntry {
  path: string;
  prunable?: boolean | undefined;
}

export interface HostAgentScopeRuntimeScope extends HostWorkspaceScopeRecord {
  displayPath: string;
  checkoutRemoved?: boolean;
}

export interface HostAgentScopeRuntimeFs {
  mkdir: typeof fs.promises.mkdir;
  realpath: typeof fs.promises.realpath;
  lstat: typeof fs.promises.lstat;
}

export interface HostAgentScopeRuntimeOptions {
  store: Pick<
    AgentScopeStore,
    | 'ensureWorkspace'
    | 'getWorkspace'
    | 'bindSession'
    | 'getSession'
    | 'listWorkspaces'
    | 'checkWorktreeScope'
    | 'listArchivedWorktreeWorkspaces'
    | 'listWorkspacesWithArchivedSessions'
    | 'hasArchivedSessions'
    | 'isWorktreeArchived'
  >;
  readSettings: () => Promise<SettingsDocument>;
  sanitizeProjects: (raw: RawValue) => NormalizedProject[] | undefined;
  validateDirectoryPath: (directory: string) => Promise<HostDirectoryValidationResult>;
  getWorktrees: (directory: string) => Promise<HostWorktreeEntry[]>;
  managedChatsScope?: Pick<ScheduledChatsScope, 'id' | 'root' | 'createChatDirectory' | 'discardChatDirectory'> | undefined;
  getArchiveCatalog?: (() => SpaceArchiveCatalogEntry[]) | undefined;
  agentDirectory?: string | undefined;
  fsPromises?: HostAgentScopeRuntimeFs | undefined;
}

export interface HostAgentScopeRuntime {
  initialize(): Promise<void>;
  createChatWorkspace(): Promise<HostWorkspaceScopeRecord>;
  archiveScope(spaceId: string, directory: string): Promise<{
    projectId: string;
    workspaceId: string;
    cwd: string;
    agentDirectory: string;
  }>;
  registerArchiveSession(
    session: { sessionId: string; rootSessionId: string },
    children: ReadonlyArray<{ childSessionId: string }>,
    scope: { projectId: string; workspaceId: string; cwd: string; agentDirectory: string },
  ): Promise<HostWorkspaceScopeRecord>;
  resolveWorkspaceScope(workspaceId: string, claimId?: string): Promise<HostAgentScopeRuntimeScope | null>;
  resolveWorkspaceDirectory(directory: string): Promise<Workspace | null>;
  resolveRepositoryWorkspace(directory: string): Promise<Workspace | null>;
  resolveSessionScope(sessionId: string): Promise<(HostSessionScopeRecord & { displayPath: string; checkoutRemoved?: boolean }) | null>;
  resolveRelocationSourceScope(sessionId: string): Promise<(HostSessionScopeRecord & { displayPath: string }) | null>;
  registerSessionScope(session: RuntimeSession): Promise<HostSessionScopeRecord>;
  listProjects(): Promise<{ items: Project[]; errors: Record<string, string> }>;
  listWorkspaces(projectId?: string): Promise<{ items: Workspace[]; errors: Record<string, string> }>;
}

const removedDirectoryKey = (directory: string): string => (process.platform === 'win32'
  ? directory.replace(/\\/g, '/').replace(/^[a-z]:/i, (drive) => drive.toUpperCase()).replace(/\/+$/, '')
  : directory);

const failureCode = (error: Error | string): string => (error instanceof HostMetadataError ? error.code : 'METADATA_READ_FAILED');

const displayPath = (scope: { projectDirectory: string; cwd: string }): string =>
  path.relative(scope.projectDirectory, scope.cwd) || '.';

const publicWorkspace = (scope: HostWorkspaceScopeRecord): Workspace => ({
  workspaceId: scope.workspaceId,
  projectId: scope.projectId,
  name: scope.cwd === scope.projectDirectory ? scope.name : path.basename(scope.cwd),
  displayPath: displayPath(scope),
});

export function resolveDefaultAgentDirectory(env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string {
  const profile = (env.OMP_PROFILE || env.PI_PROFILE || '').trim();
  if (profile && /^[a-zA-Z0-9_-]+$/.test(profile)) {
    return path.join(home, '.omp', 'profiles', profile, 'agent');
  }
  const configDir = env.PI_CONFIG_DIR?.trim();
  if (configDir) {
    return path.resolve(configDir);
  }
  return path.join(home, '.omp', 'agent');
}

export const createHostAgentScopeRuntime = ({
  store,
  readSettings,
  sanitizeProjects,
  validateDirectoryPath,
  getWorktrees,
  managedChatsScope,
  getArchiveCatalog = () => [],
  agentDirectory = resolveDefaultAgentDirectory(),
  fsPromises = fs.promises,
}: HostAgentScopeRuntimeOptions): HostAgentScopeRuntime => {
  const readProjects = async (): Promise<NormalizedProject[]> => sanitizeProjects((await readSettings()).projects) ?? [];
  const initialize = async (): Promise<void> => {
    await fsPromises.mkdir(agentDirectory, { recursive: true, mode: 0o700 });
    if (managedChatsScope) await fsPromises.mkdir(managedChatsScope.root, { recursive: true, mode: 0o700 });
  };
  const selectedDirectory = (): Promise<string> => fsPromises.realpath(agentDirectory);
  const archiveSpaceId = (workspaceId: string): string | null => /^archive_([a-f0-9]{12})$/.exec(workspaceId)?.[1] ?? null;

  const archiveScope = async (spaceId: string, directory: string) => ({
    projectId: `archive_${spaceId}`,
    workspaceId: `archive_${spaceId}`,
    cwd: directory,
    agentDirectory: await selectedDirectory(),
  });
  const registerArchiveWorkspace = (scope: { projectId: string; workspaceId: string; cwd: string; agentDirectory: string }) => store.ensureWorkspace({
    hostProjectId: scope.projectId,
    projectId: scope.projectId,
    workspaceId: scope.workspaceId,
    projectDirectory: scope.cwd,
    workspaceDirectory: scope.cwd,
    agentDirectory: scope.agentDirectory,
    name: 'Deleted space archive',
    displayPath: '.',
  });
  const registerArchiveSession = async (
    session: { sessionId: string; rootSessionId: string },
    children: ReadonlyArray<{ childSessionId: string }>,
    scope: { projectId: string; workspaceId: string; cwd: string; agentDirectory: string },
  ): Promise<HostWorkspaceScopeRecord> => {
    const workspace = await registerArchiveWorkspace(scope);
    const rootSessionId = session.rootSessionId;
    await store.bindSession({ sessionId: session.sessionId, rootSessionId, workspaceId: workspace.workspaceId, agentDirectoryId: workspace.agentDirectoryId });
    for (const child of children) {
      await store.bindSession({ sessionId: child.childSessionId, rootSessionId, workspaceId: workspace.workspaceId, agentDirectoryId: workspace.agentDirectoryId });
    }
    return workspace;
  };
  const validateDirectory = async (directory: string): Promise<string> => {
    const validated = await validateDirectoryPath(directory);
    if (!validated.ok) throw new MetadataReadError('A configured Host workspace is unavailable');
    const current = await fsPromises.realpath(validated.requestedDirectory ?? directory);
    if (current !== validated.directory) throw new MetadataReadError('A configured Host workspace changed its directory target');
    const canonical = await validateDirectoryPath(current);
    if (!canonical.ok || canonical.directory !== current) throw new MetadataReadError('A configured Host workspace is unavailable');
    return current;
  };
  const contains = (root: string, directory: string): boolean => {
    const relative = path.relative(root, directory);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };
  const managedRoot = (): Promise<string> => {
    if (!managedChatsScope) throw new MetadataWriteError('The Host managed chats scope is unavailable');
    return validateDirectory(managedChatsScope.root);
  };
  const admitChatDirectory = async (directory: string): Promise<HostWorkspaceScopeRecord> => {
    if (!managedChatsScope) throw new MetadataWriteError('The Host managed chats scope is unavailable');
    const [projectDirectory, cwd, selectedAgentDirectory] = await Promise.all([
      managedRoot(),
      validateDirectory(directory),
      selectedDirectory(),
    ]);
    if (!contains(projectDirectory, cwd)) throw new MetadataWriteError('A managed chat is outside its Host root');
    return store.ensureWorkspace({
      hostProjectId: managedChatsScope.id,
      projectDirectory,
      workspaceDirectory: cwd,
      agentDirectory: selectedAgentDirectory,
      name: 'Chats',
    });
  };
  const createChatWorkspace = async (): Promise<HostWorkspaceScopeRecord> => {
    if (!managedChatsScope) throw new MetadataWriteError('The Host managed chats scope is unavailable');
    const directory = await managedChatsScope.createChatDirectory();
    try {
      return await admitChatDirectory(directory);
    } catch (error) {
      await managedChatsScope.discardChatDirectory(directory);
      throw error;
    }
  };
  const discover = async (): Promise<{ scopes: HostAgentScopeRuntimeScope[]; errors: Record<string, string> }> => {
    const [projects, selectedAgentDirectory] = await Promise.all([readProjects(), selectedDirectory()]);
    const scopes: HostAgentScopeRuntimeScope[] = [];
    const errors: Record<string, string> = {};
    for (const [index, project] of projects.entries()) {
      let root: HostWorkspaceScopeRecord;
      try {
        const projectDirectory = await validateDirectory(project.path);
        root = await store.ensureWorkspace({
          hostProjectId: project.id,
          projectDirectory,
          workspaceDirectory: projectDirectory,
          agentDirectory: selectedAgentDirectory,
          name: project.label || path.basename(projectDirectory),
        });
        scopes.push({ ...root, displayPath: displayPath(root) });
      } catch (error) {
        errors[`configured-project-${index}`] = failureCode(error instanceof Error ? error : String(error));
        continue;
      }
      let worktrees: HostWorktreeEntry[];
      try {
        worktrees = await getWorktrees(root.projectDirectory);
      } catch (error) {
        errors[root.projectId] = failureCode(error instanceof Error ? error : String(error));
        continue;
      }
      for (const [worktreeIndex, worktree] of worktrees.entries()) {
        if (worktree.prunable) continue;
        try {
          const cwd = await validateDirectory(worktree.path);
          if (cwd === root.cwd) continue;
          const scope = await store.ensureWorkspace({
            hostProjectId: project.id,
            projectDirectory: root.projectDirectory,
            workspaceDirectory: cwd,
            agentDirectory: selectedAgentDirectory,
            name: root.name,
          });
          scopes.push({ ...scope, displayPath: displayPath(scope) });
        } catch (error) {
          errors[`workspace-${index}-${worktreeIndex}`] = failureCode(error instanceof Error ? error : String(error));
        }
      }
    }
    if (managedChatsScope) {
      try {
        const root = await admitChatDirectory(managedChatsScope.root);
        const listed = await store.listWorkspaces(root.projectId);
        Object.assign(errors, listed.errors);
        for (const scope of listed.items) {
          try {
            const folderRemoved = await fsPromises.lstat(scope.cwd).then(
              () => false,
              (cause) => ErrorCodeSchema.safeParse(cause).data?.code === 'ENOENT',
            );
            if (folderRemoved && !(z.function().safeParse(store.hasArchivedSessions).success && await store.hasArchivedSessions(scope.workspaceId))) continue;
            const allowed = await authorize(scope);
            if (allowed) scopes.push(allowed);
            else errors[scope.workspaceId] = 'METADATA_READ_FAILED';
          } catch (error) {
            errors[scope.workspaceId] = failureCode(error instanceof Error ? error : String(error));
          }
        }
      } catch (error) {
        errors['managed-chats'] = failureCode(error instanceof Error ? error : String(error));
      }
    }
    for (const entry of getArchiveCatalog()) {
      const workspaceId = `archive_${entry.spaceId}`;
      try {
        let scope = await store.getWorkspace(workspaceId);
        if (!scope) scope = await registerArchiveWorkspace(await archiveScope(entry.spaceId, entry.directory));
        const allowed = await authorize(scope);
        if (allowed) scopes.push(allowed);
        else errors[workspaceId] = 'METADATA_READ_FAILED';
      } catch (error) {
        errors[workspaceId] = failureCode(error instanceof Error ? error : String(error));
      }
    }
    if (z.function().safeParse(store.listArchivedWorktreeWorkspaces).success) {
      const archivedWorkspaces = [...new Set([
        ...await store.listArchivedWorktreeWorkspaces(),
        ...(z.function().safeParse(store.listWorkspacesWithArchivedSessions).success ? await store.listWorkspacesWithArchivedSessions() : []),
      ])];
      for (const workspaceId of archivedWorkspaces) {
        try {
          const scope = await store.getWorkspace(workspaceId);
          if (scope) {
            const allowed = await authorize(scope);
            if (allowed) scopes.push(allowed);
            else errors[workspaceId] = 'METADATA_READ_FAILED';
          }
        } catch (error) {
          errors[workspaceId] = failureCode(error instanceof Error ? error : String(error));
        }
      }
    }
    return { scopes: [...new Map(scopes.map((scope) => [scope.workspaceId, scope])).values()], errors };
  };
  const authorize = async <Scope extends HostWorkspaceScopeRecord>(
    scope: Scope,
    claimId?: string,
  ): Promise<(Scope & { displayPath: string; checkoutRemoved?: boolean }) | null> => {
    await store.checkWorktreeScope(scope.cwd, claimId);
    const [projects, selectedAgentDirectory] = await Promise.all([readProjects(), selectedDirectory()]);
    if (scope.agentDirectory !== selectedAgentDirectory) return null;
    if (managedChatsScope && scope.hostProjectId === managedChatsScope.id) {
      const projectDirectory = await managedRoot();
      if (scope.projectDirectory !== projectDirectory || !contains(projectDirectory, scope.cwd)) return null;
      const cwd = await validateDirectory(scope.cwd);
      if (cwd !== scope.cwd) return null;
      await store.checkWorktreeScope(scope.cwd, claimId);
      return { ...scope, displayPath: displayPath(scope) };
    }
    const spaceId = archiveSpaceId(scope.workspaceId);
    if (spaceId) {
      const catalogEntry = getArchiveCatalog().find((entry) => entry.spaceId === spaceId && entry.directory === scope.cwd);
      if (!catalogEntry || scope.projectId !== `archive_${spaceId}` || scope.projectDirectory !== scope.cwd) return null;
      const directory = await fsPromises.realpath(scope.cwd);
      if (directory !== scope.cwd || scope.agentDirectory !== selectedAgentDirectory) return null;
      await store.checkWorktreeScope(scope.cwd, claimId);
      return { ...scope, displayPath: '.' };
    }
    const checkoutRemoved = await fsPromises.lstat(scope.cwd).then(
      () => false,
      (cause) => ErrorCodeSchema.safeParse(cause).data?.code === 'ENOENT',
    );
    const removedWithArchivedSessions = checkoutRemoved
      && z.function().safeParse(store.hasArchivedSessions).success
      && await store.hasArchivedSessions(scope.workspaceId);
    if ((z.function().safeParse(store.isWorktreeArchived).success && await store.isWorktreeArchived(scope.workspaceId)) || removedWithArchivedSessions) {
      const project = projects.find((item) => item.id === scope.hostProjectId);
      if (!project) return null;
      const projectDirectory = await validateDirectory(project.path);
      if (projectDirectory !== scope.projectDirectory || scope.agentDirectory !== selectedAgentDirectory) return null;
      await store.checkWorktreeScope(scope.cwd, claimId);
      if (checkoutRemoved) return { ...scope, displayPath: displayPath(scope), checkoutRemoved };
      return { ...scope, displayPath: displayPath(scope) };
    }
    const project = projects.find((item) => item.id === scope.hostProjectId);
    if (!project) return null;
    const [projectDirectory, cwd] = await Promise.all([
      validateDirectory(project.path),
      validateDirectory(scope.cwd),
    ]);
    if (projectDirectory !== scope.projectDirectory || cwd !== scope.cwd) return null;
    if (cwd !== projectDirectory) {
      const worktrees = await getWorktrees(projectDirectory);
      let registered = false;
      let readError: Error | string | undefined;
      for (const worktree of worktrees) {
        if (worktree.prunable) continue;
        try {
          if (await fsPromises.realpath(worktree.path) === cwd) { registered = true; break; }
        } catch (error) { readError ??= error instanceof Error ? error : String(error); }
      }
      if (!registered && readError) throw new MetadataReadError('Registered Host worktrees could not be read', readError);
      if (!registered) return null;
    }
    await store.checkWorktreeScope(scope.cwd, claimId);
    return { ...scope, displayPath: displayPath(scope) };
  };
  const resolveWorkspaceDirectory = async (directory: string): Promise<Workspace | null> => {
    const parsed = WorkspaceDirectorySchema.safeParse(directory);
    if (!parsed.success) return null;
    const requested = await validateDirectoryPath(parsed.data);
    if (!requested.ok) {
      const key = removedDirectoryKey(parsed.data);
      const removed = (await discover()).scopes.find((scope) => scope.checkoutRemoved && removedDirectoryKey(scope.cwd) === key);
      return removed ? publicWorkspace(removed) : null;
    }
    const [projects, selectedAgentDirectory] = await Promise.all([readProjects(), selectedDirectory()]);
    let discoveryFailed = false;
    if (managedChatsScope) {
      let root: string | undefined;
      try { root = await managedRoot(); } catch { discoveryFailed = true; }
      if (root && contains(root, requested.directory)) return publicWorkspace(await admitChatDirectory(requested.directory));
    }
    for (const project of projects) {
      let projectDirectory: string;
      try { projectDirectory = await validateDirectory(project.path); } catch { discoveryFailed = true; continue; }
      if (projectDirectory === requested.directory) {
        return publicWorkspace(await store.ensureWorkspace({
          hostProjectId: project.id,
          projectDirectory,
          workspaceDirectory: requested.directory,
          agentDirectory: selectedAgentDirectory,
          name: project.label || path.basename(projectDirectory),
        }));
      }
      let worktrees: HostWorktreeEntry[];
      try { worktrees = await getWorktrees(projectDirectory); } catch { discoveryFailed = true; continue; }
      for (const worktree of worktrees) {
        if (worktree.prunable) continue;
        try {
          const worktreeDirectory = await validateDirectory(worktree.path);
          if (worktreeDirectory !== requested.directory) continue;
          return publicWorkspace(await store.ensureWorkspace({
            hostProjectId: project.id,
            projectDirectory,
            workspaceDirectory: requested.directory,
            agentDirectory: selectedAgentDirectory,
            name: project.label || path.basename(projectDirectory),
          }));
        } catch { discoveryFailed = true; }
      }
    }
    if (discoveryFailed) throw new MetadataReadError('Configured Host workspace discovery is unavailable');
    return null;
  };
  const resolveRepositoryWorkspace = async (directory: string): Promise<Workspace | null> => {
    const exact = await resolveWorkspaceDirectory(directory);
    if (exact) return exact;
    const parsed = WorkspaceDirectorySchema.safeParse(directory);
    if (!parsed.success) return null;
    const requested = await validateDirectoryPath(parsed.data);
    if (!requested.ok) return null;
    const canonical = await validateDirectory(requested.directory);
    let owner: string | null = null;
    for (const project of await readProjects()) {
      const projectDirectory = await validateDirectory(project.path);
      if (contains(projectDirectory, canonical) && (!owner || projectDirectory.length > owner.length)) owner = projectDirectory;
      for (const worktree of await getWorktrees(projectDirectory)) {
        if (worktree.prunable) continue;
        const worktreeDirectory = await validateDirectory(worktree.path);
        if (contains(worktreeDirectory, canonical) && (!owner || worktreeDirectory.length > owner.length)) owner = worktreeDirectory;
      }
    }
    return owner ? resolveWorkspaceDirectory(owner) : null;
  };
  const resolveWorkspaceScope = async (workspaceId: string, claimId?: string): Promise<HostAgentScopeRuntimeScope | null> => {
    const scope = await store.getWorkspace(workspaceId);
    return scope === null ? null : authorize(scope, claimId);
  };
  const resolveSessionScope = async (
    sessionId: string,
  ): Promise<(HostSessionScopeRecord & { displayPath: string; checkoutRemoved?: boolean }) | null> => {
    const scope = await store.getSession(sessionId);
    return scope === null ? null : authorize(scope);
  };
  const registerSessionScope = async (session: RuntimeSession): Promise<HostSessionScopeRecord> => {
    const admitted = RuntimeSessionSchema.parse(session);
    const workspace = await resolveWorkspaceScope(admitted.workspaceId);
    if (!workspace || workspace.projectId !== admitted.projectId) {
      throw new MetadataWriteError('An admitted session does not match its authorized Host workspace');
    }
    return store.bindSession({
      sessionId: admitted.sessionId,
      rootSessionId: admitted.rootSessionId,
      workspaceId: workspace.workspaceId,
      agentDirectoryId: workspace.agentDirectoryId,
    });
  };
  const resolveRelocationSourceScope = async (sessionId: string): Promise<(HostSessionScopeRecord & { displayPath: string }) | null> => {
    const scope = await store.getSession(sessionId);
    if (!scope) return null;
    const [projects, selectedAgentDirectory] = await Promise.all([readProjects(), selectedDirectory()]);
    if (scope.agentDirectory !== selectedAgentDirectory) return null;
    if (managedChatsScope && scope.hostProjectId === managedChatsScope.id) {
      const projectDirectory = await managedRoot();
      return scope.projectDirectory === projectDirectory && contains(projectDirectory, scope.cwd)
        ? { ...scope, displayPath: displayPath(scope) }
        : null;
    }
    const project = projects.find((item) => item.id === scope.hostProjectId);
    if (!project || await validateDirectory(project.path) !== scope.projectDirectory) return null;
    return { ...scope, displayPath: displayPath(scope) };
  };
  const listProjects = async (): Promise<{ items: Project[]; errors: Record<string, string> }> => {
    const { scopes, errors } = await discover();
    const projects = new Map<string, { projectId: string; name: string; workspaceIds: string[] }>();
    for (const scope of scopes) {
      let project = projects.get(scope.projectId);
      if (!project) {
        project = { projectId: scope.projectId, name: scope.name, workspaceIds: [] };
        projects.set(scope.projectId, project);
      }
      project.workspaceIds.push(scope.workspaceId);
    }
    return { items: [...projects.values()].map((project) => ProjectSchema.parse(project)), errors };
  };
  const listWorkspaces = async (projectId?: string): Promise<{ items: Workspace[]; errors: Record<string, string> }> => {
    const { scopes, errors } = await discover();
    return {
      items: scopes.filter((scope) => projectId === undefined || scope.projectId === projectId).map(publicWorkspace),
      errors,
    };
  };
  return {
    initialize,
    createChatWorkspace,
    archiveScope,
    registerArchiveSession,
    resolveWorkspaceScope,
    resolveWorkspaceDirectory,
    resolveRepositoryWorkspace,
    resolveSessionScope,
    resolveRelocationSourceScope,
    registerSessionScope,
    listProjects,
    listWorkspaces,
  };
};
