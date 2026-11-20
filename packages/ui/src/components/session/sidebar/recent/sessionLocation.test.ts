import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import type { WorktreeMetadata } from '@/types/worktree';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
import { createSessionOwnershipIndex } from '../sessions/sessionOwnership';
import { deriveTimelineActivityItems } from './activitySections';
import { resolveSidebarSessionLocations } from './sessionLocation';

const projects = [{ id: 'repo', normalizedPath: '/repo', label: 'Repo' }];
const session = (sessionId: string, displayPath: string): Session => {
  const workspaceId = `workspace-${sessionId}`;
  registerWorkspaceDirectory(workspaceId, displayPath);
  return {
    sessionId, rootSessionId: sessionId,
    projectId: 'repo',
    workspaceId,
    displayPath,
    createdAt: 1, updatedAt: 1, epoch: '1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
    metadata: null, metadataRevision: '0', archiveRevision: '0',
  };
};

const worktreeMeta = (path: string, branch: string): WorktreeMetadata => ({
  path,
  projectDirectory: '/repo',
  branch,
  label: branch,
});

const resolveLocations = (
  records: Session[],
  availableWorktreesByProject: Map<string, WorktreeMetadata[]>,
  gitBranches: ReadonlyMap<string, string | null> = new Map(),
  hideBranchMatchingProjectLabel = true,
) => {
  const ownership = createSessionOwnershipIndex(records, projects, availableWorktreesByProject);
  return resolveSidebarSessionLocations({
    sessions: records, projects, ownerBySessionId: ownership.bySessionId,
    availableWorktreesByProject, gitBranches, homeDirectory: null,
    hideBranchMatchingProjectLabel,
  });
};

describe('resolveSidebarSessionLocations', () => {
  test('keeps a restored missing-worktree session in Timeline with its actual request directory', () => {
    const restored = session('restored', '/worktrees/deleted');
    const ownership = createSessionOwnershipIndex(
      [restored], projects, new Map(), [], [{ id: 'opencode-repo', name: 'Repo space', state: 'complete', projectDirectory: '/repo', directory: '/repo' }],
    );
    for (const hideBranchMatchingProjectLabel of [true, false]) {
      const locations = resolveSidebarSessionLocations({
        sessions: [restored], projects, ownerBySessionId: ownership.bySessionId,
        availableWorktreesByProject: new Map(), gitBranches: new Map(),
        homeDirectory: null, hideBranchMatchingProjectLabel,
      });
      expect(locations.get(restored.sessionId)).toEqual({
        projectId: 'repo', groupDirectory: restored.displayPath, projectLabel: 'Repo',
        branchLabel: null, inSpace: false, worktree: null,
      });
      const items = deriveTimelineActivityItems({
        sessions: [restored], getSessionLocation: (id) => locations.get(id) ?? null,
        getSessionNode: (record) => ({ session: record, children: [], worktree: null }),
      });
      expect(items[0]?.node.session).toBe(restored);
      expect(items[0]?.projectId).toBe('repo');
      expect(items[0]?.groupDirectory).toBe('/worktrees/deleted');
    }
  });

  test('keeps worktree metadata and the distinct Recent/Timeline branch-label policies', () => {
    const record = session('worktree', '/worktrees/feature');
    const worktree: WorktreeMetadata = {
      path: record.displayPath, projectDirectory: '/repo', branch: 'Repo', label: 'feature',
    };
    const availableWorktreesByProject = new Map([['/repo', [worktree]]]);
    const ownership = createSessionOwnershipIndex([record], projects, availableWorktreesByProject);
    for (const hideBranchMatchingProjectLabel of [true, false]) {
      const locations = resolveSidebarSessionLocations({
        sessions: [record], projects, ownerBySessionId: ownership.bySessionId,
        availableWorktreesByProject, gitBranches: new Map(), homeDirectory: null,
        hideBranchMatchingProjectLabel,
      });
      expect(locations.get(record.sessionId)?.worktree).toBe(worktree);
      expect(locations.get(record.sessionId)?.branchLabel).toBe(hideBranchMatchingProjectLabel ? null : 'Repo');
    }
  });

  test('leaves unrelated sessions unassigned and hides detached HEAD', () => {
    const records = [{ ...session('unowned', '/elsewhere'), projectId: 'missing-project' }, session('detached', '/repo')];
    const ownership = createSessionOwnershipIndex(records, projects, new Map());
    const locations = resolveSidebarSessionLocations({
      sessions: records, projects, ownerBySessionId: ownership.bySessionId,
      availableWorktreesByProject: new Map(), gitBranches: new Map([['/repo', 'HEAD']]),
      homeDirectory: null, hideBranchMatchingProjectLabel: false,
    });
    expect(locations.has('unowned')).toBe(false);
    expect(locations.get('detached')?.branchLabel).toBeNull();
  });

  test('resolves worktree metadata for sessions inside <worktree>/sub through the longest prefix', () => {
    const exact = session('exact', '/worktrees/feature');
    const sub = session('sub', '/worktrees/feature/sub');
    const deeper = session('deeper', '/worktrees/feature/sub/deeper');
    const worktree = worktreeMeta('/worktrees/feature', 'feature-1');
    const availableWorktreesByProject = new Map([['/repo', [worktree]]]);
    const locations = resolveLocations([exact, sub, deeper], availableWorktreesByProject);

    for (const record of [exact, sub, deeper]) {
      expect(locations.get(record.sessionId)?.projectId).toBe('repo');
      expect(locations.get(record.sessionId)?.worktree).toBe(worktree);
      expect(locations.get(record.sessionId)?.branchLabel).toBe('feature-1');
      expect(locations.get(record.sessionId)?.groupDirectory).toBe(record.displayPath);
    }
  });

  test('prefers the innermost containing worktree for nested worktrees', () => {
    const nested = session('nested', '/tmp/wt/outer/inner/sub');
    const outer = worktreeMeta('/tmp/wt/outer', 'outer');
    const inner = worktreeMeta('/tmp/wt/outer/inner', 'inner');
    const locations = resolveLocations([nested], new Map([['/repo', [outer, inner]]]));

    expect(locations.get('nested')?.worktree).toBe(inner);
    expect(locations.get('nested')?.branchLabel).toBe('inner');
  });

  test('keeps the project root and unregistered worktree buckets out of the index', () => {
    const rootRecord = session('root-record', '/repo/');
    const featureSub = session('feature-sub', '/worktrees/feature/sub');
    const rootWorktree = worktreeMeta('/repo', 'main');
    const feature = worktreeMeta('/worktrees/feature/', 'feature-1');
    const foreign = worktreeMeta('/elsewhere/wt', 'other');
    const availableWorktreesByProject = new Map([
      ['/repo/', [rootWorktree, feature]],
      ['/elsewhere', [foreign]],
    ]);
    const locations = resolveLocations([rootRecord, featureSub], availableWorktreesByProject);

    // `/repo/` normalizes to the configured project root, so the root entry
    // never becomes a worktree; the normalized worktree key still resolves.
    expect(locations.get('root-record')?.worktree).toBeNull();
    expect(locations.get('feature-sub')?.worktree).toBe(feature);
  });

  test('live git status wins over stored worktree metadata, including <worktree>/sub', () => {
    const exact = session('exact', '/worktrees/feature');
    const sub = session('sub', '/worktrees/feature/sub');
    const worktree = worktreeMeta('/worktrees/feature', 'stored-1');
    const locations = resolveLocations(
      [exact, sub],
      new Map([['/repo', [worktree]]]),
      new Map([['/worktrees/feature', 'live-1'], ['/worktrees/feature/sub', 'live-sub']]),
      false,
    );

    expect(locations.get('exact')?.branchLabel).toBe('live-1');
    expect(locations.get('sub')?.branchLabel).toBe('live-sub');
    // The stored branch stays reachable through the node's worktree for the
    // project-row fallback, never as the displayed Recent/Timeline label.
    expect(locations.get('exact')?.worktree?.branch).toBe('stored-1');
    expect(locations.get('sub')?.worktree?.branch).toBe('stored-1');
  });

  test('falls back to the worktree-root live branch and only then to stored metadata', () => {
    const sub = session('sub', '/worktrees/feature/sub');
    const worktree = worktreeMeta('/worktrees/feature', 'stored-1');
    const availableWorktreesByProject = new Map([['/repo', [worktree]]]);

    const rootLive = resolveLocations(
      [sub], availableWorktreesByProject, new Map([['/worktrees/feature', 'live-1']]), false,
    );
    expect(rootLive.get('sub')?.branchLabel).toBe('live-1');

    const storedOnly = resolveLocations([sub], availableWorktreesByProject, new Map(), false);
    expect(storedOnly.get('sub')?.branchLabel).toBe('stored-1');
  });

  test('labels a session of an isolated space with the space name and groups it by the space directory', () => {
    const SPACE = 'a1b2c3d4e5f6';
    const records = [session('in-space', `/spaces/${SPACE}/repo/src`), session('at-root', '/repo')];
    const ownership = createSessionOwnershipIndex(records, projects, new Map(), [], [{ id: SPACE, name: 'Fix login', state: 'complete', projectDirectory: '/repo', directory: `/spaces/${SPACE}/repo` }]);
    const locations = resolveSidebarSessionLocations({
      sessions: records, projects, ownerBySessionId: ownership.bySessionId,
      availableWorktreesByProject: new Map(), gitBranches: new Map([[`/spaces/${SPACE}/repo`, 'master']]), homeDirectory: null,
      hideBranchMatchingProjectLabel: false,
      spaceLabelById: new Map([[SPACE, 'Fix login']]),
    });
    expect(locations.get('in-space')).toEqual({
      projectId: 'repo', groupDirectory: `/spaces/${SPACE}/repo`, projectLabel: 'Repo', branchLabel: 'Fix login', inSpace: true, worktree: null,
    });
    expect(locations.get('at-root')?.branchLabel).toBeNull();
    expect(locations.get('at-root')?.inSpace).toBe(false);
  });
});
