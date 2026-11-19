import { checkoutHoldsDirectory } from '@/lib/worktrees/worktreePaths';
import { canonicalClient } from '@/api/canonicalClient';
import type { Session } from '@openchamber/agent-contract';
import { normalizePath } from '@/lib/pathNormalization';
import { snapshotGitWorktree } from '@/lib/gitApi';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { listProjectWorktrees, removeProjectWorktree, type ProjectRef } from '@/lib/worktrees/worktreeManager';
import { resolveWorkspaceDirectory } from '@/stores/globalSessions';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { getMultiRunIdentity } from './identity';
import { type RunMemberLocation } from './memberLocation';
import type { MultiRunSummary } from './runs';


type KeepFailureReason = 'membership-changed' | 'snapshot-failed' | 'archive-failed' | 'worktree-in-use' | 'worktree-removal-failed';

export type KeepRunResult = {
  keptSessionId: string;
  archivedIds: string[];
  failures: Array<{ sessionId: string; reason: KeepFailureReason }>;
};

export const runSnapshotRef = (run: Pick<MultiRunSummary, 'key' | 'groupSlug' | 'lanes' | 'fusions'>, sessionId: string): string => {
  const member = [...run.lanes, ...run.fusions].find((entry) => entry.sessionId === sessionId);
  const group = member?.identity.group;
  const groupPart = group?.kind === 'id' ? group.id : run.groupSlug.replace(/[^A-Za-z0-9._-]+/g, '-') || 'legacy';
  return `refs/openchamber/runs/${groupPart}/${sessionId.replace(/[^A-Za-z0-9._-]+/g, '-')}`;
};

const projectRefFor = (path: string): ProjectRef => {
  const project = useProjectsStore.getState().projects.find((entry) => normalizePath(entry.path) === path);
  return { id: project?.id ?? `path:${path}`, path };
};

export async function resolveRunMemberLocation(session: Session, run: MultiRunSummary): Promise<RunMemberLocation | null> {
  const runtimeKey = getRuntimeKey();
  const assertCurrent = () => { if (getRuntimeKey() !== runtimeKey) throw new Error('Runtime changed'); };
  const directory = normalizePath(resolveWorkspaceDirectory(session.workspaceId));
  if (!directory) return null;
  const known = useSessionUIStore.getState().getWorktreeMetadata(session.sessionId);
  const knownProject = normalizePath(known?.projectDirectory);
  if (known && knownProject && normalizePath(known.path) === directory) {
    return { project: projectRefFor(knownProject), worktree: knownProject === directory ? null : known };
  }
  const member = [...run.lanes, ...run.fusions].find((entry) => entry.sessionId === session.sessionId);
  const group = member?.identity.group;
  const legacyScope = group?.kind === 'legacy'
    ? normalizePath(useProjectsStore.getState().projects.find((project) => project.id === group.scope)?.path) : null;
  const projects = useProjectsStore.getState().projects
    .map((project) => normalizePath(project.path))
    .filter((path): path is string => Boolean(path));
  if (projects.includes(directory)) return { project: projectRefFor(directory), worktree: null };
  const candidates = legacyScope ? [legacyScope, ...projects.filter((path) => path !== legacyScope)] : projects;
  for (const projectPath of candidates) {
    const project = projectRefFor(projectPath);
    assertCurrent();
    const worktrees = await listProjectWorktrees(project);
    assertCurrent();
    const worktree = worktrees.find((entry) => normalizePath(entry.path) === directory);
    if (worktree) return { project, worktree };
  }
  return null;
}

export async function keepRunMember(
  run: MultiRunSummary,
  keptSessionId: string,
  sessionById: ReadonlyMap<string, Session>,
): Promise<KeepRunResult> {
  const runtimeKey = getRuntimeKey();
  const assertCurrent = () => {
    if (getRuntimeKey() !== runtimeKey) throw new Error('Runtime changed');
  };
  const result: KeepRunResult = { keptSessionId, archivedIds: [], failures: [] };
  const others = run.memberIds.filter((id) => id !== keptSessionId);

  for (const sessionId of others) {
    assertCurrent();
    const cached = sessionById.get(sessionId);
    if (!cached) {
      result.failures.push({ sessionId, reason: 'membership-changed' });
      continue;
    }
    let current: Session;
    try {
      const listed = await canonicalClient.listSessions(cached.workspaceId);
      const found = listed.items.find((session) => session.sessionId === sessionId);
      if (!found || listed.errors[sessionId] || listed.errors[cached.workspaceId]) throw new Error('Member could not be read');
      current = found;
    } catch {
      assertCurrent();
      result.failures.push({ sessionId, reason: 'membership-changed' });
      continue;
    }
    assertCurrent();
    const location = await resolveRunMemberLocation(current, run).catch(() => null);
    assertCurrent();
    const identity = getMultiRunIdentity(current, current.projectId);
    if (identity?.key !== run.key) {
      result.failures.push({ sessionId, reason: 'membership-changed' });
      continue;
    }

    const worktree = location?.worktree ?? null;
    if (worktree) {
      try {
        await snapshotGitWorktree(worktree.path, { ref: runSnapshotRef(run, sessionId) });
      } catch {
        assertCurrent();
        result.failures.push({ sessionId, reason: 'snapshot-failed' });
        continue;
      }
      assertCurrent();
    }

    const archived = await useSessionUIStore.getState().archiveSessions([sessionId], { expectedRuntimeKey: runtimeKey });
    assertCurrent();
    if (!archived.archivedIds.includes(sessionId)) {
      result.failures.push({ sessionId, reason: 'archive-failed' });
      continue;
    }
    result.archivedIds.push(sessionId);
    if (!worktree || !location) continue;

    try {
      // Another chat the user started in this worktree keeps it alive.
      const workspace = await canonicalClient.resolveWorkspace(worktree.path);
      assertCurrent();
      if (workspace.workspaceId !== current.workspaceId || normalizePath(resolveWorkspaceDirectory(current.workspaceId)) !== normalizePath(worktree.path)) throw new Error('Worktree workspace changed');
      const remaining = await canonicalClient.listSessions(workspace.workspaceId);
      assertCurrent();
      if (Object.keys(remaining.errors).length > 0) throw new Error('Worktree session discovery is incomplete');
      const archivedMember = remaining.items.find((session) => session.sessionId === sessionId);
      if (!archivedMember || archivedMember.archivedAt === undefined || getMultiRunIdentity(archivedMember, archivedMember.projectId)?.key !== run.key) {
        result.failures.push({ sessionId, reason: 'membership-changed' });
        continue;
      }
      if (remaining.items.some((session) => session.sessionId !== sessionId && session.archivedAt === undefined)) {
        result.failures.push({ sessionId, reason: 'worktree-in-use' });
        continue;
      }
      await removeProjectWorktree(location.project, worktree, { deleteLocalBranch: true });
      assertCurrent();
      const directoryStore = useDirectoryStore.getState();
      const currentDirectory = normalizePath(directoryStore.currentDirectory);
      const removedCheckout = normalizePath(worktree.path);
      if (currentDirectory && removedCheckout && checkoutHoldsDirectory(removedCheckout, currentDirectory)) {
        directoryStore.setDirectory(location.project.path, { showOverlay: false });
      }
    } catch {
      assertCurrent();
      result.failures.push({ sessionId, reason: 'worktree-removal-failed' });
    }
  }
  return result;
}
