import type { Session } from '@openchamber/agent-contract';
import { getNormalizedParentDirectory, normalizePath } from '@/lib/pathNormalization';
import type { SpaceMark } from '@/lib/spaces/spaces-store';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';

type Project = {
  id: string;
  normalizedPath: string;
};

type Worktree = {
  path: string;
};


export type DirectoryOwner = {
  projectId: string;
  projectRoot: string;
  scopeDirectory: string;
  kind: 'project' | 'worktree' | 'space';
  spaceId?: string;
};

export type SessionOwnershipIndex = {
  bySessionId: Map<string, DirectoryOwner>;
  sessionsByProject: Map<string, Session[]>;
  archivedSessionsByProject: Map<string, Session[]>;
  sessionsByScope: Map<string, Set<string>>;
  directoryResolutions: number;
};

const shouldReplaceOwner = (existing: DirectoryOwner | undefined, candidate: DirectoryOwner): boolean => {
  if (!existing) return true;
  if (candidate.kind !== existing.kind) {
    return candidate.kind === 'project';
  }
  if (candidate.projectRoot.length !== existing.projectRoot.length) {
    return candidate.projectRoot.length > existing.projectRoot.length;
  }
  return candidate.projectId.localeCompare(existing.projectId) < 0;
};

const setOwner = (owners: Map<string, DirectoryOwner>, directory: string, candidate: DirectoryOwner): void => {
  if (shouldReplaceOwner(owners.get(directory), candidate)) {
    owners.set(directory, candidate);
  }
};

export const createSessionOwnershipIndex = (
  sessions: readonly Session[],
  projects: readonly Project[],
  availableWorktreesByProject: Map<string, Worktree[]>,
  archivedSessions: readonly Session[] = [],
  spaces: readonly SpaceMark[] = [],
): SessionOwnershipIndex => {
  const ownerByDirectory = new Map<string, DirectoryOwner>();
  const projectByRoot = new Map<string, Project>();

  for (const project of projects) {
    const projectRoot = normalizePath(project.normalizedPath);
    if (!projectRoot) continue;
    const existingProject = projectByRoot.get(projectRoot);
    if (!existingProject || project.id.localeCompare(existingProject.id) < 0) {
      projectByRoot.set(projectRoot, project);
    }
    setOwner(ownerByDirectory, projectRoot, {
      projectId: project.id,
      projectRoot,
      scopeDirectory: projectRoot,
      kind: 'project',
    });
  }

<<<<<<< HEAD
  for (const [projectPath, worktrees] of availableWorktreesByProject) {
    const projectRoot = normalizePath(projectPath);
    const project = projectRoot ? projectByRoot.get(projectRoot) : undefined;
    if (!project || !projectRoot) continue;
    for (const worktree of worktrees) {
      const directory = normalizePath(worktree.path);
      if (!directory) continue;
||||||| bc50ba56aa
  if (!isVSCode) {
    for (const [projectPath, worktrees] of availableWorktreesByProject) {
      const projectRoot = normalizePath(projectPath);
      const project = projectRoot ? projectByRoot.get(projectRoot) : undefined;
      if (!project || !projectRoot) continue;
      for (const worktree of worktrees) {
        const directory = normalizePath(worktree.path);
        if (!directory) continue;
        setOwner(ownerByDirectory, directory, {
          projectId: project.id,
          projectRoot,
          scopeDirectory: directory,
          kind: 'worktree',
        });
      }
    }
  }

  // An isolated space belongs to the registered project it was made for, as the host resolved
  // it from the space's label; a space whose project is not registered here owns nothing, so
  // its sessions stay out of every project, as any session without an owner does. VS Code never
  // has spaces (decision 16 of the design).
  if (!isVSCode) {
    for (const space of spaces) {
      const projectRoot = normalizePath(space.projectDirectory);
      const directory = normalizePath(space.directory);
      const project = projectRoot ? projectByRoot.get(projectRoot) : undefined;
      if (!project || !projectRoot || !directory) continue;
=======
  if (!isVSCode) {
    for (const [projectPath, worktrees] of availableWorktreesByProject) {
      const projectRoot = normalizePath(projectPath);
      const project = projectRoot ? projectByRoot.get(projectRoot) : undefined;
      if (!project || !projectRoot) continue;
      for (const worktree of worktrees) {
        const directory = normalizePath(worktree.path);
        if (!directory) continue;
        setOwner(ownerByDirectory, directory, {
          projectId: project.id,
          projectRoot,
          scopeDirectory: directory,
          kind: 'worktree',
        });
      }
    }
  }

  if (!isVSCode) {
    for (const space of spaces) {
      const projectRoot = normalizePath(space.projectDirectory);
      const directory = normalizePath(space.directory);
      const project = projectRoot ? projectByRoot.get(projectRoot) : undefined;
      if (!project || !projectRoot || !directory) continue;
>>>>>>> upstream/main
      setOwner(ownerByDirectory, directory, {
        projectId: project.id,
        projectRoot,
        scopeDirectory: directory,
        kind: 'worktree',
      });
    }
  }

<<<<<<< HEAD
  // An isolated space belongs to the registered project the host resolved for
  // it; sessions without a registered owner stay out of every project.
  for (const space of spaces) {
    const projectRoot = normalizePath(space.projectDirectory);
    const directory = normalizePath(space.directory);
    const project = projectRoot ? projectByRoot.get(projectRoot) : undefined;
    if (!project || !projectRoot || !directory) continue;
    setOwner(ownerByDirectory, directory, {
||||||| bc50ba56aa
  // OpenCode project IDs are not OpenChamber's path-derived project IDs. Only
  // project metadata whose canonical worktree is itself a configured root can
  // bridge the two namespaces. Conflicting metadata stays unresolved.
  const canonicalOwnerByOpenCodeProjectId = new Map<string, DirectoryOwner | null>();
  const authoritativeProjectIds = new Set<string>();
  const registerCanonicalOwner = (openCodeProjectId: string, worktree: string | null | undefined): void => {
    // `global` is OpenCode's catch-all project, not a real project: every
    // session whose directory resolves to no configured root (non-git
    // directories, `C:/`, subagent workspaces) shares it. Bridging it to a
    // configured root would file those unrelated sessions under whichever
    // project happens to own the id, so it never gets a canonical owner.
    if (openCodeProjectId === 'global') return;
    const canonicalRoot = normalizePath(worktree ?? null);
    const project = canonicalRoot ? projectByRoot.get(canonicalRoot) : undefined;
    const candidate = project && canonicalRoot ? {
=======
  const canonicalOwnerByOpenCodeProjectId = new Map<string, DirectoryOwner | null>();
  const authoritativeProjectIds = new Set<string>();
  const registerCanonicalOwner = (openCodeProjectId: string, worktree: string | null | undefined): void => {
    if (openCodeProjectId === 'global') return;
    const canonicalRoot = normalizePath(worktree ?? null);
    const project = canonicalRoot ? projectByRoot.get(canonicalRoot) : undefined;
    const candidate = project && canonicalRoot ? {
>>>>>>> upstream/main
      projectId: project.id,
      projectRoot,
      scopeDirectory: directory,
      kind: 'space',
      spaceId: space.id,
    });
  }

  // Canonical project identity can retain sessions from deleted worktrees even
  // when the current directory topology no longer contains their workspace.
  const ownerByProjectId = new Map<string, DirectoryOwner>();
  for (const owner of ownerByDirectory.values()) {
    if (owner.kind === 'project') ownerByProjectId.set(owner.projectId, owner);
  }

  const resolvedOwners = new Map<string, DirectoryOwner | null>();
  const bySessionId = new Map<string, DirectoryOwner>();
  const sessionsByProject = new Map<string, Session[]>();
  const archivedSessionsByProject = new Map<string, Session[]>();
  const sessionsByScope = new Map<string, Set<string>>();

  const resolveOwner = (directory: string | null): DirectoryOwner | null => {
    if (!directory) return null;
    if (resolvedOwners.has(directory)) {
      return resolvedOwners.get(directory) ?? null;
    }

    const visited: string[] = [];
    let current: string | null = directory;
    let owner: DirectoryOwner | null = null;
    while (current) {
      if (resolvedOwners.has(current)) {
        owner = resolvedOwners.get(current) ?? null;
        break;
      }
      visited.push(current);
      owner = ownerByDirectory.get(current) ?? null;
      if (owner) break;
      current = getNormalizedParentDirectory(current);
    }
    for (const visitedDirectory of visited) {
      resolvedOwners.set(visitedDirectory, owner);
    }
    return owner;
  };

  const bucket = (
    input: readonly Session[],
    target: Map<string, Session[]>,
    scopeTarget?: Map<string, Set<string>>,
  ): void => {
    for (const session of input) {
      const exactOwner = resolveOwner(normalizePath(resolveGlobalSessionDirectory(session)));
      const owner = exactOwner ?? ownerByProjectId.get(session.projectId) ?? null;
      if (!owner) continue;
      bySessionId.set(session.sessionId, owner);
      const projectSessions = target.get(owner.projectId);
      if (projectSessions) {
        projectSessions.push(session as Session);
      } else {
        target.set(owner.projectId, [session as Session]);
      }
      if (!scopeTarget) continue;
      const scopeSessions = scopeTarget.get(owner.scopeDirectory);
      if (scopeSessions) {
        scopeSessions.add(session.sessionId);
      } else {
        scopeTarget.set(owner.scopeDirectory, new Set([session.sessionId]));
      }
    }
  };

  bucket(sessions, sessionsByProject, sessionsByScope);
<<<<<<< HEAD
  // The sidebar's archived buckets hold top-level sessions only: a subsession
  // belongs to the agent run that spawned it. One archived under an active
  // parent is listed on the Archive page instead (`isRestorableOnItsOwn`).
  bucket(archivedSessions.filter((session) => !session.parentSessionId), archivedSessionsByProject);
||||||| bc50ba56aa
  // The sidebar's archived buckets hold top-level sessions only: a subsession
  // belongs to the agent run that spawned it. One archived under an active
  // parent is listed on the Archive page instead (`isRestorableOnItsOwn`).
  bucket(archivedSessions.filter((session) => !session.parentID), archivedSessionsByProject);
=======
  bucket(archivedSessions.filter((session) => !session.parentID), archivedSessionsByProject);
>>>>>>> upstream/main

  return {
    bySessionId,
    sessionsByProject,
    archivedSessionsByProject,
    sessionsByScope,
    directoryResolutions: resolvedOwners.size,
  };
};
