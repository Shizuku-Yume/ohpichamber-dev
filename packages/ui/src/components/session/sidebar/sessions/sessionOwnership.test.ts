import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';

import {
  createSessionOwnershipIndex,
} from './sessionOwnership';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';

const ownershipSession = (
  sessionId: string,
  options: { displayPath?: string; projectId?: string; project?: { id?: string; worktree?: string } } = {},
): Session => {
  const directory = options.displayPath ?? options.project?.worktree ?? '/workspace';
  const workspaceId = `wsp_${sessionId}`;
  registerWorkspaceDirectory(workspaceId, directory);
  return {
    sessionId,
    rootSessionId: sessionId,
    projectId: options.projectId ?? options.project?.id ?? 'project',
    workspaceId,
    displayPath: directory,
    createdAt: 1, updatedAt: 1, epoch: '1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
    metadata: null,
    metadataRevision: '0', archiveRevision: '0',
  };
};

describe('createSessionOwnershipIndex', () => {
  test('assigns sessions to the deepest project and registered worktree', () => {
    const sessions = [
      { ...ownershipSession('nested', { displayPath: '/projects/app/packages/admin/src' }) },
      { ...ownershipSession('external-worktree', { displayPath: '/worktrees/app-feature/src' }) },
      { ...ownershipSession('worktree-fallback', { project: { worktree: '/worktrees/app-feature/src' } }) },
      { ...ownershipSession('directory-wins', { displayPath: '/projects/app/packages/admin', project: { worktree: '/projects/app' } }) },
      { ...ownershipSession('windows', { displayPath: 'c:\\Projects\\App\\src' }) },
      { ...ownershipSession('unassigned', { displayPath: '/elsewhere' }) },
    ];
    const projects = [
      { id: 'app', normalizedPath: '/projects/app' },
      { id: 'admin', normalizedPath: '/projects/app/packages/admin' },
      { id: 'windows-app', normalizedPath: 'C:/Projects/App' },
    ];
    const worktrees = new Map([
      ['/projects/app', [{ path: '/worktrees/app-feature' }]],
    ]);

    const ownership = createSessionOwnershipIndex(sessions, projects, worktrees);

    expect(ownership.bySessionId.get('nested')?.projectId).toBe('admin');
    expect(ownership.bySessionId.get('external-worktree')).toEqual({
      projectId: 'app',
      projectRoot: '/projects/app',
      scopeDirectory: '/worktrees/app-feature',
      kind: 'worktree',
    });
    expect(ownership.bySessionId.get('worktree-fallback')?.scopeDirectory).toBe('/worktrees/app-feature');
    expect(ownership.bySessionId.get('directory-wins')?.projectId).toBe('admin');
    expect(ownership.bySessionId.get('windows')?.projectId).toBe('windows-app');
    expect(ownership.bySessionId.has('unassigned')).toBe(false);
    expect(ownership.sessionsByProject.get('admin')?.map((record) => record.sessionId)).toEqual([
      'nested',
      'directory-wins',
    ]);
    expect(ownership.sessionsByScope.get('/worktrees/app-feature')).toEqual(new Set([
      'external-worktree',
      'worktree-fallback',
    ]));
  });

  test('gives an exact project precedence over a colliding worktree', () => {
    const ownership = createSessionOwnershipIndex(
      [ownershipSession('nested', { displayPath: '/projects/app/packages/admin/src' })],
      [
        { id: 'app', normalizedPath: '/projects/app' },
        { id: 'admin', normalizedPath: '/projects/app/packages/admin' },
      ],
      new Map([['/projects/app', [{ path: '/projects/app/packages/admin' }]]]),
    );

    expect(ownership.bySessionId.get('nested')?.projectId).toBe('admin');
    expect(ownership.bySessionId.get('nested')?.kind).toBe('project');
  });

  test('indexes archived sessions separately', () => {
    const ownership = createSessionOwnershipIndex(
      [],
      [{ id: 'app', normalizedPath: '/projects/app' }],
      new Map([['/projects/app', [{ path: '/worktrees/app-feature' }]]]),
      [
        { ...ownershipSession('archived-child', { displayPath: '/worktrees/app-feature/src' }), archiveRevision: '1' },
        { ...ownershipSession('archived-fallback', { project: { worktree: '/worktrees/app-feature' } }), archiveRevision: '1' },
      ],
    );

    expect(ownership.archivedSessionsByProject.get('app')?.map((record) => record.sessionId)).toEqual([
      'archived-child',
      'archived-fallback',
    ]);
  });

  test('resolves a deleted directory through canonical OpenCode project metadata', () => {
    const ownership = createSessionOwnershipIndex(
      [
        ownershipSession('restored', { projectId: 'configured-app', displayPath: '/deleted/worktrees/feature' }),
        ownershipSession('canonical', { projectId: 'configured-app', displayPath: '/projects/app' }),
      ],
      [{ id: 'configured-app', normalizedPath: '/projects/app' }],
      new Map([['/projects/app', [{ path: '/worktrees/feature' }]]]),
    );

    expect(ownership.bySessionId.get('restored')).toEqual({
      projectId: 'configured-app',
      projectRoot: '/projects/app',
      scopeDirectory: '/projects/app',
      kind: 'project',
    });
  });

  test('resolves a bare session projectID from authoritative global project metadata', () => {
    const ownership = createSessionOwnershipIndex(
      [ownershipSession('restored', { projectId: 'configured-app', displayPath: '/deleted/worktrees/feature' })],
      [{ id: 'configured-app', normalizedPath: '/projects/app' }],
      new Map(),
    );

    expect(ownership.bySessionId.get('restored')?.projectId).toBe('configured-app');
  });

  test('prefers authoritative project metadata over conflicting embedded metadata', () => {
    const ownership = createSessionOwnershipIndex(
      [ownershipSession('restored', {
        projectId: 'configured-authoritative',
        displayPath: '/deleted/worktrees/feature',
      })],
      [
        { id: 'configured-authoritative', normalizedPath: '/projects/authoritative' },
        { id: 'configured-embedded', normalizedPath: '/projects/embedded' },
      ],
      new Map(),
    );

    expect(ownership.bySessionId.get('restored')?.projectId).toBe('configured-authoritative');
  });

  test('leaves conflicting embedded canonical roots unassigned', () => {
    const ownership = createSessionOwnershipIndex(
      [
        ownershipSession('restored', { projectId: 'unknown-app', displayPath: '/deleted/worktree' }),
      ],
      [
        { id: 'configured-one', normalizedPath: '/projects/one' },
        { id: 'configured-two', normalizedPath: '/projects/two' },
      ],
      new Map(),
    );

    expect(ownership.bySessionId.has('restored')).toBe(false);
  });

  test('keeps deleted-directory sessions unassigned without a canonical configured root', () => {
    const ownership = createSessionOwnershipIndex(
      [ownershipSession('restored', {
        projectId: 'unconfigured-app',
        displayPath: '/deleted/worktrees/feature',
      })],
      [{ id: 'configured-app', normalizedPath: '/projects/app' }],
      new Map(),
    );

    expect(ownership.bySessionId.has('restored')).toBe(false);
  });

  test('prefers exact topology over OpenCode project metadata fallback', () => {
    const ownership = createSessionOwnershipIndex(
      [
        ownershipSession('worktree', { projectId: 'configured-app', displayPath: '/worktrees/app-feature' }),
        ownershipSession('canonical', { projectId: 'configured-app', displayPath: '/projects/app' }),
      ],
      [{ id: 'configured-app', normalizedPath: '/projects/app' }],
      new Map([['/projects/app', [{ path: '/worktrees/app-feature' }]]]),
    );

    expect(ownership.bySessionId.get('worktree')?.scopeDirectory).toBe('/worktrees/app-feature');
    expect(ownership.bySessionId.get('worktree')?.kind).toBe('worktree');
  });

  test('supports a Windows drive root project', () => {
    const ownership = createSessionOwnershipIndex(
      [ownershipSession('windows-root', { displayPath: 'c:\\Users\\name\\project' })],
      [{ id: 'drive', normalizedPath: 'C:/' }],
      new Map(),
    );

    expect(ownership.bySessionId.get('windows-root')?.projectId).toBe('drive');
    expect(ownership.bySessionId.get('windows-root')?.scopeDirectory).toBe('C:/');
  });

  test('resolves report-sized data once instead of once per project consumer', () => {
    const projects = Array.from({ length: 15 }, (_, index) => ({
      id: `project-${index}`,
      normalizedPath: `/projects/${index}`,
    }));
    const worktrees = new Map(projects.map((project, projectIndex) => [
      project.normalizedPath,
      Array.from({ length: projectIndex < 7 ? 5 : 4 }, (_, index) => ({
        path: `/worktrees/${projectIndex}/${index}`,
      })),
    ]));
    const sessions = Array.from({ length: 14_561 }, (_, index) =>
      ownershipSession(`session-${index}`, { displayPath: `/worktrees/${index % 15}/${index % 4}/session/${index}` }),
    );

    const ownership = createSessionOwnershipIndex(sessions, projects, worktrees);

    expect(ownership.bySessionId.size).toBe(14_561);
    expect(ownership.directoryResolutions).toBeLessThan(14_561 * 2);
    expect([...ownership.sessionsByProject.values()].reduce((total, bucket) => total + bucket.length, 0)).toBe(14_561);
  });

  test('assigns a space\'s sessions to the project the host resolved for it, and drops those of a space without one', () => {
    const SPACE = 'a1b2c3d4e5f6';
    const ORPHAN = '0f0f0f0f0f0f';
    const sessions = [
      ownershipSession('in-space', { displayPath: `/spaces/${SPACE}/app/src` }),
      ownershipSession('orphan-space', { displayPath: `/spaces/${ORPHAN}/app` }),
    ];
    const projects = [{ id: 'app', normalizedPath: '/projects/app' }];
    const spaces = [
      { id: SPACE, name: 'Fix login', state: 'complete' as const, projectDirectory: '/projects/app', directory: `/spaces/${SPACE}/app` },
      { id: ORPHAN, name: 'Old', state: 'stale' as const, projectDirectory: null, directory: null },
    ];

    const ownership = createSessionOwnershipIndex(sessions, projects, new Map(), [], spaces);

    expect(ownership.bySessionId.get('in-space')).toEqual({
      projectId: 'app',
      projectRoot: '/projects/app',
      scopeDirectory: `/spaces/${SPACE}/app`,
      kind: 'space',
      spaceId: SPACE,
    });
    expect(ownership.bySessionId.has('orphan-space')).toBe(false);
  });

  test('lists only top-level sessions as archived', () => {
    const archivedParent = ownershipSession('archived-parent');
    const archivedChild: Session = { ...ownershipSession('archived-child'), parentSessionId: 'archived-parent' };
    const ownership = createSessionOwnershipIndex(
      [],
      [{ id: 'workspace', normalizedPath: '/workspace' }],
      new Map(),
      [archivedParent, archivedChild],
    );

    expect(ownership.archivedSessionsByProject.get('workspace')?.map((record) => record.sessionId)).toEqual(['archived-parent']);
  });
});

