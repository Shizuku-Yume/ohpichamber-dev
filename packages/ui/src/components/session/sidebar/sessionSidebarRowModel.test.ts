import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
import type { SessionGroup, SessionNode } from './types';
import type { ProjectSection } from './projects/sessionProjectRender';
<<<<<<< HEAD
import { buildSessionSidebarRowModel, countSessionSearchMatches, resolveSessionSidebarStickyHeader, runExpansionKey, type SessionSidebarActivityItem, type SessionSidebarRowModelArgs, type SessionSidebarWorkEntry } from './sessionSidebarRowModel';
import { countSessionTreeQueryMatches } from './recent/activitySections';
||||||| bc50ba56aa
import { getWorkFolderOwnerKey } from './sessions/sessionFolderIdentity';
import { buildSessionSidebarRowModel, countSessionSearchMatches, resolveSessionSidebarStickyHeader, runExpansionKey, type SessionSidebarActivityItem, type SessionSidebarRowModelArgs, type SessionSidebarWorkEntry } from './sessionSidebarRowModel';
import { countSessionTreeQueryMatches } from './recent/activitySections';
=======
import { getWorkFolderOwnerKey } from './sessions/sessionFolderIdentity';
import { buildSessionSidebarRowModel, resolveSessionSidebarStickyHeader, runExpansionKey, type SessionSidebarActivityItem, type SessionSidebarRowModelArgs, type SessionSidebarWorkEntry } from './sessionSidebarRowModel';
import { deriveSessionRowBulkSelectAll } from './sessions/sessionRowOrder';
>>>>>>> upstream/main
import { buildMultiRunIndex } from '@/lib/multirun/runs';
import { withMultiRunMembership } from '@/lib/multirun/identity';
import { getPinnedSessionKey } from '@/lib/sessionPins';
import { getRuntimeKey } from '@/lib/runtime-switch';

const timelineItem = (id: string, overrides: Partial<SessionSidebarActivityItem> = {}): SessionSidebarActivityItem => ({
  node: { session: session(id), children: [], worktree: null },
  projectId: 'project-a',
  groupDirectory: '/repo',
  secondaryMeta: { projectLabel: 'repo', branchLabel: 'main' },
  ...overrides,
});

const sessionWorks = (items: SessionSidebarActivityItem[]): SessionSidebarWorkEntry[] => items.map((item) => ({ kind: 'session', item }));

const pinnedIds = (...ids: string[]): Set<string> => new Set(
  ids.flatMap((id) => {
    const key = getPinnedSessionKey(getRuntimeKey(), '/repo', id);
    return key ? [key] : [];
  }),
);

// SAFETY: the row model only reads the supplied session identity, title, directory, parent, and lifecycle fields.
const session = (sessionId: string, parentSessionId?: string, overrides: Partial<Session> = {}): Session => {
  registerWorkspaceDirectory('workspace-a', '/repo');
  return {
    sessionId,
    projectId: 'project-a',
    workspaceId: 'workspace-a',
    displayPath: '/repo',
    rootSessionId: sessionId,
    createdAt: 1,
    updatedAt: 1,
    epoch: '1',
    headSequence: '0',
    runtimeStatus: 'idle',
    activeRunId: null,
    mode: { kind: 'main' as const },
    metadata: null,
    metadataRevision: '0',
    archiveRevision: '0',
    parentSessionId,
    ...overrides,
  };
};

const node = (id: string, children: SessionNode[] = []): SessionNode => ({ session: session(id), children, worktree: null });

const group = (sessions: SessionNode[], overrides: Partial<SessionGroup> = {}): SessionGroup => ({
  id: 'main',
  label: 'main',
  branch: null,
  description: null,
  isMain: true,
  worktree: null,
  directory: '/repo',
  folderScopeKey: '/repo',
  sessions,
  ...overrides,
});

const project = (groups: SessionGroup[]): ProjectSection => ({
  project: { id: 'project-a', normalizedPath: '/repo' },
  groups,
});

const args = (sections: ProjectSection[]): SessionSidebarRowModelArgs => ({
  mode: 'normal',
  sections,
  authoritativeSections: sections,
  chatGroup: null,
  foldersMap: {},
  collapsedProjects: new Set(),
  collapsedGroups: new Set(),
  collapsedFolders: new Set(),
  collapsedActivities: new Set(),
  expandedParents: new Set(),
  visibleCountByContainer: new Map(),
  pinnedSessionIds: new Set(),
  sessionOrderIndex: new Map(),
  groupStatusByKey: new Map(),
  sessionOwnerById: new Map(),
  folderAuthorityByOwner: new Map([['project-a', { scopeKeys: ['/repo'], complete: true }]]),
  activeProjectId: 'project-a',
  singleProjectMode: false,
  singleProjectId: null,
  showOnlyMainWorkspace: false,
  hideDirectoryControls: false,
});

describe('buildSessionSidebarRowModel', () => {
  test('a session in work is in the top block and stays in its project group', () => {
    const working = node('working');
    const other = node('other');
    const input = args([project([group([working, other])])]);
    input.workEntries = sessionWorks([timelineItem('working')]);

    const model = buildSessionSidebarRowModel(input);
    const sessionRows = model.rows.flatMap((row) => (row.kind === 'session' ? [`${row.renderContext}:${row.node.session.sessionId}`] : []));

    expect(model.rows[0]).toMatchObject({ kind: 'activity-header', activityKey: 'work' });
    expect(sessionRows).toEqual(['mixed-compact:working', 'project:other', 'project:working']);
    expect(model.selectionEntries.filter((entry) => entry.id === 'working')).toHaveLength(2);
    expect(new Set(model.rows.map((row) => row.key)).size).toBe(model.rows.length);
  });

  test('detailed zone rows give the Tree view the two-line row', () => {
    const input = args([project([group([node('working')])])]);
    input.workEntries = sessionWorks([timelineItem('working')]);
    input.detailedZoneRows = true;

    const rows = buildSessionSidebarRowModel(input).rows;
    const zoneRow = rows.find((row) => row.kind === 'session');

    expect(zoneRow?.kind === 'session' && zoneRow.renderContext).toBe('timeline-mixed');
  });

  test('Pinned opens above In work and its sessions stay in their project', () => {
    const input = args([project([group([node('pinned'), node('working')])])]);
    input.pinnedItems = [timelineItem('pinned')];
    input.workEntries = sessionWorks([timelineItem('working')]);

    const rows = buildSessionSidebarRowModel(input).rows;
    const order = rows.flatMap((row) => (
      row.kind === 'activity-header' ? [row.activityKey]
        : row.kind === 'session' ? [`${row.renderContext}:${row.node.session.sessionId}`]
          : []
    ));

    expect(order).toEqual(['pinned', 'mixed-compact:pinned', 'work', 'mixed-compact:working', 'project:pinned', 'project:working']);
  });

<<<<<<< HEAD
  test('search lists a pinned session once, in Pinned', () => {
    const pinnedNode = node('ses_pinned');
    const main = group([pinnedNode, node('ses_other')]);
    const input = args([project([main])]);
    input.mode = 'search';
    input.normalizedQuery = 'ses_pinned';
    input.groupSearchDataByGroup.set(main, {
      filteredNodes: [pinnedNode],
      matchedSessionCount: countSessionSearchMatches([pinnedNode], 'ses_pinned'),
      folderNameMatchCount: 0,
      groupMatches: false,
      hasMatch: true,
    });
    input.pinnedItems = [{ ...timelineItem('ses_pinned'), node: pinnedNode }];
    input.zoneSessionIds = new Set(['ses_pinned']);

    const model = buildSessionSidebarRowModel(input);

    expect(model.searchMatchCount).toBe(1);
    expect(model.rows.flatMap((row) => (row.kind === 'activity-header' ? [row.activityKey] : row.kind === 'project-header' ? ['project'] : []))).toEqual(['pinned']);
    expect(model.rows.filter((row) => row.kind === 'session')).toHaveLength(1);
  });

||||||| bc50ba56aa
  test('the blocks set the order: a section of the user\'s own lists its works under its name', () => {
    const input = args([project([group([node('waiting'), node('other')])])]);
    input.workEntries = sessionWorks([timelineItem('other')]);
    input.movedSessionIds = new Set(['waiting']);
    input.projectsCaption = true;
    input.blocks = [
      { kind: 'custom', id: 's1', name: 'Waiting on me', entries: sessionWorks([timelineItem('waiting')]), hideWhenEmpty: true, preview: false },
      { kind: 'work' },
      { kind: 'projects' },
    ];

    const rows = buildSessionSidebarRowModel(input).rows;
    const order = rows.flatMap((row) => (
      row.kind === 'activity-header' ? [`${row.activityKey}${row.label ? `=${row.label}` : ''}`]
        : row.kind === 'session' ? [`${row.renderContext}:${row.node.session.id}`]
          : row.kind === 'caption' ? [`caption:${row.caption}`]
            : []
    ));

    expect(order).toEqual(['section:s1=Waiting on me', 'mixed-compact:waiting', 'work', 'mixed-compact:other', 'caption:projects', 'project:other']);
  });

  test('an empty section of the user\'s own hides unless kept, and a kept one says it is empty', () => {
    const input = args([project([group([node('a')])])]);
    input.blocks = [{ kind: 'custom', id: 's1', name: 'Today', entries: [], hideWhenEmpty: true, preview: false }, { kind: 'projects' }];
    expect(buildSessionSidebarRowModel(input).rows.some((row) => row.kind === 'activity-header')).toBe(false);

    input.blocks = [{ kind: 'custom', id: 's1', name: 'Today', entries: [], hideWhenEmpty: false, preview: false }, { kind: 'projects' }];
    const rows = buildSessionSidebarRowModel(input).rows;
    expect(rows[0]).toMatchObject({ kind: 'activity-header', activityKey: 'section:s1' });
    expect(rows[1]).toMatchObject({ kind: 'empty', emptyKind: 'section' });
  });

  test('an empty group of projects shows its caption only when kept', () => {
    const input = args([project([group([node('a')])])]);
    input.blocks = [{ kind: 'project-group', id: 'g1', name: 'Clients', projectIds: [], hideWhenEmpty: true, preview: false }];
    expect(buildSessionSidebarRowModel(input).rows.some((row) => row.kind === 'caption')).toBe(false);

    input.blocks = [{ kind: 'project-group', id: 'g1', name: 'Clients', projectIds: [], hideWhenEmpty: false, preview: false }];
    const rows = buildSessionSidebarRowModel(input).rows;
    expect(rows[0]).toMatchObject({ kind: 'caption', caption: 'section:g1', label: 'Clients' });
    expect(rows[1]).toMatchObject({ kind: 'empty', emptyKind: 'section' });
  });

  test('a group of projects lists its projects under its caption, and Projects lists the rest', () => {
    const projectB: ProjectSection = { project: { id: 'project-b', normalizedPath: '/other' }, groups: [group([node('b')], { directory: '/other', folderScopeKey: '/other' })] };
    const input = args([project([group([node('a')])]), projectB]);
    input.projectsCaption = true;
    input.blocks = [
      { kind: 'project-group', id: 'g1', name: 'Clients', projectIds: ['project-b'], hideWhenEmpty: false, preview: false },
      { kind: 'projects', excludedProjectIds: new Set(['project-b']) },
    ];

    const order = buildSessionSidebarRowModel(input).rows.flatMap((row) => (
      row.kind === 'caption' ? [`caption:${row.label ?? row.caption}`]
        : row.kind === 'project-header' ? [`project:${row.section.project.id}`]
          : []
    ));

    expect(order).toEqual(['caption:Clients', 'project:project-b', 'caption:projects', 'project:project-a']);
  });

  test('search lists a pinned session once, in Pinned', () => {
    const pinnedNode = node('ses_pinned');
    const main = group([pinnedNode, node('ses_other')]);
    const input = args([project([main])]);
    input.mode = 'search';
    input.normalizedQuery = 'ses_pinned';
    input.groupSearchDataByGroup.set(main, {
      filteredNodes: [pinnedNode],
      matchedSessionCount: countSessionSearchMatches([pinnedNode], 'ses_pinned'),
      folderNameMatchCount: 0,
      groupMatches: false,
      hasMatch: true,
    });
    input.pinnedItems = [{ ...timelineItem('ses_pinned'), node: pinnedNode }];
    input.zoneSessionIds = new Set(['ses_pinned']);

    const model = buildSessionSidebarRowModel(input);

    expect(model.searchMatchCount).toBe(1);
    expect(model.rows.flatMap((row) => (row.kind === 'activity-header' ? [row.activityKey] : row.kind === 'project-header' ? ['project'] : []))).toEqual(['pinned']);
    expect(model.rows.filter((row) => row.kind === 'session')).toHaveLength(1);
  });

=======
  test('a session listed again lower down is marked as a repeat; the first from the top is not', () => {
    const input = args([project([group([node('pinned'), node('working'), node('plain')])])]);
    input.pinnedItems = [timelineItem('pinned')];
    input.workEntries = sessionWorks([timelineItem('working')]);

    const marks = buildSessionSidebarRowModel(input).rows.flatMap((row) => (
      row.kind === 'session' ? [`${row.renderContext}:${row.node.session.id}:${row.repeat === true}`] : []
    ));

    expect(marks).toEqual([
      'mixed-compact:pinned:false',
      'mixed-compact:working:false',
      'project:pinned:true',
      'project:plain:false',
      'project:working:true',
    ]);
  });

  test('the blocks set the order: a section of the user\'s own lists its works under its name', () => {
    const input = args([project([group([node('waiting'), node('other')])])]);
    input.workEntries = sessionWorks([timelineItem('other')]);
    input.movedSessionIds = new Set(['waiting']);
    input.projectsCaption = true;
    input.blocks = [
      { kind: 'custom', id: 's1', name: 'Waiting on me', entries: sessionWorks([timelineItem('waiting')]), hideWhenEmpty: true, preview: false },
      { kind: 'work' },
      { kind: 'projects' },
    ];

    const rows = buildSessionSidebarRowModel(input).rows;
    const order = rows.flatMap((row) => (
      row.kind === 'activity-header' ? [`${row.activityKey}${row.label ? `=${row.label}` : ''}`]
        : row.kind === 'session' ? [`${row.renderContext}:${row.node.session.id}`]
          : row.kind === 'caption' ? [`caption:${row.caption}`]
            : []
    ));

    expect(order).toEqual(['section:s1=Waiting on me', 'mixed-compact:waiting', 'work', 'mixed-compact:other', 'caption:projects', 'project:other']);
  });

  describe('the reveal limit in zones', () => {
    const ids = (count: number, prefix: string): string[] => Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
    const zoneRows = (input: SessionSidebarRowModelArgs) => {
      const rows = buildSessionSidebarRowModel(input).rows;
      return {
        sessions: rows.flatMap((row) => (row.kind === 'session' ? [row.node.session.id] : [])),
        controls: rows.filter((row) => row.kind === 'show-control'),
      };
    };

    test('a section of the user\'s own shows the first batch, then pages by the batch and folds back', () => {
      const input = args([]);
      input.blocks = [{ kind: 'custom', id: 's1', name: 'Recent', entries: sessionWorks(ids(12, 'r').map((id) => timelineItem(id))), hideWhenEmpty: true, preview: false }];

      const first = zoneRows(input);
      expect(first.sessions).toEqual(ids(7, 'r'));
      expect(first.controls).toHaveLength(1);
      expect(first.controls[0]).toMatchObject({ containerKey: 'activity:section:s1', more: true, fewer: false, currentCount: 7, increment: 7 });
      if (first.controls[0]?.kind !== 'show-control') throw new Error('no Show more');
      expect(first.controls[0].hiddenNodes.map((hidden) => hidden.session.id)).toEqual(ids(12, 'r').slice(7));

      input.visibleCountByContainer = new Map([['activity:section:s1', 14]]);
      const all = zoneRows(input);
      expect(all.sessions).toEqual(ids(12, 'r'));
      expect(all.controls[0]).toMatchObject({ more: false, fewer: true });
    });

    test('the user\'s number sets Pinned\'s batch, and a pinned worktree spends a slot', () => {
      const input = args([]);
      input.sessionBatchSize = 3;
      input.pinnedItems = ids(3, 'p').map((id) => timelineItem(id));
      input.pinnedWorktrees = [{ kind: 'group', groupKey: 'project-a:worktree:/wt', projectId: 'project-a', group: group([node('in-wt')], { id: 'wt', isMain: false, directory: '/wt', worktree: null }) }];

      const { sessions, controls } = zoneRows(input);
      expect(sessions).toEqual(ids(3, 'p'));
      expect(controls[0]).toMatchObject({ containerKey: 'activity:pinned', more: true, increment: 3 });
      const model = buildSessionSidebarRowModel(input);
      expect(model.rows.some((row) => row.kind === 'group-header')).toBe(false);
      // Held back, the worktree's sessions still select with Ctrl/Cmd+A.
      expect(model.selectionEntries.some((entry) => entry.id === 'in-wt' && entry.scopeKey === 'activity:pinned' && entry.rowKey === null)).toBe(true);
    });

    test('a run spends one slot whatever its lane count', () => {
      const lanes = ids(3, 'lane').map((id) => timelineItem(id));
      const input = args([]);
      input.runIndex = buildMultiRunIndex(lanes.map((lane) => ({
        ...lane.node.session,
        metadata: withMultiRunMembership({}, {
          version: 1, sessionID: lane.node.session.id, group: { kind: 'id', id: '9f512893-6e63-4e49-a534-5de733ca103e' },
          groupSlug: 'fix-auth', role: 'run', providerID: 'anthropic', modelID: 'claude', title: 'Fix auth',
        }),
      })), () => '/repo');
      input.sessionBatchSize = 3;
      const rest = ids(4, 'r').map((id) => timelineItem(id));
      input.blocks = [{ kind: 'custom', id: 's1', name: 'Recent', entries: sessionWorks([...lanes, ...rest]), hideWhenEmpty: true, preview: false }];

      const rows = buildSessionSidebarRowModel(input).rows;
      expect(rows.filter((row) => row.kind === 'run')).toHaveLength(1);
      expect(rows.flatMap((row) => (row.kind === 'session' ? [row.node.session.id] : []))).toEqual(['r-0', 'r-1']);
      expect(rows.find((row) => row.kind === 'show-control')).toMatchObject({ currentCount: 3 });
    });

    test('In work lists every work it holds', () => {
      const input = args([]);
      input.workEntries = sessionWorks(ids(12, 'w').map((id) => timelineItem(id)));
      const { sessions, controls } = zoneRows(input);
      expect(sessions).toHaveLength(12);
      expect(controls).toHaveLength(0);
    });
  });

  test('an empty section of the user\'s own hides unless kept, and a kept one says it is empty', () => {
    const input = args([project([group([node('a')])])]);
    input.blocks = [{ kind: 'custom', id: 's1', name: 'Today', entries: [], hideWhenEmpty: true, preview: false }, { kind: 'projects' }];
    expect(buildSessionSidebarRowModel(input).rows.some((row) => row.kind === 'activity-header')).toBe(false);

    input.blocks = [{ kind: 'custom', id: 's1', name: 'Today', entries: [], hideWhenEmpty: false, preview: false }, { kind: 'projects' }];
    const rows = buildSessionSidebarRowModel(input).rows;
    expect(rows[0]).toMatchObject({ kind: 'activity-header', activityKey: 'section:s1' });
    expect(rows[1]).toMatchObject({ kind: 'empty', emptyKind: 'section' });
  });

  test('an empty group of projects shows its caption only when kept', () => {
    const input = args([project([group([node('a')])])]);
    input.blocks = [{ kind: 'project-group', id: 'g1', name: 'Clients', projectIds: [], hideWhenEmpty: true, preview: false }];
    expect(buildSessionSidebarRowModel(input).rows.some((row) => row.kind === 'caption')).toBe(false);

    input.blocks = [{ kind: 'project-group', id: 'g1', name: 'Clients', projectIds: [], hideWhenEmpty: false, preview: false }];
    const rows = buildSessionSidebarRowModel(input).rows;
    expect(rows[0]).toMatchObject({ kind: 'caption', caption: 'section:g1', label: 'Clients' });
    expect(rows[1]).toMatchObject({ kind: 'empty', emptyKind: 'section' });
  });

  test('a group of projects lists its projects under its caption, and Projects lists the rest', () => {
    const projectB: ProjectSection = { project: { id: 'project-b', normalizedPath: '/other' }, groups: [group([node('b')], { directory: '/other', folderScopeKey: '/other' })] };
    const input = args([project([group([node('a')])]), projectB]);
    input.projectsCaption = true;
    input.blocks = [
      { kind: 'project-group', id: 'g1', name: 'Clients', projectIds: ['project-b'], hideWhenEmpty: false, preview: false },
      { kind: 'projects', excludedProjectIds: new Set(['project-b']) },
    ];

    const order = buildSessionSidebarRowModel(input).rows.flatMap((row) => (
      row.kind === 'caption' ? [`caption:${row.label ?? row.caption}`]
        : row.kind === 'project-header' ? [`project:${row.section.project.id}`]
          : []
    ));

    expect(order).toEqual(['caption:Clients', 'project:project-b', 'caption:projects', 'project:project-a']);
  });

>>>>>>> upstream/main
  test('a session in work stays in its folder', () => {
    const input = args([project([group([node('in-folder'), node('top-level')])])]);
    input.foldersMap = { '/repo': [{ id: 'outer', name: 'Outer', createdAt: 1, sessionIds: ['in-folder'] }] };
    input.workEntries = sessionWorks([timelineItem('in-folder')]);

    const rows = buildSessionSidebarRowModel(input).rows.filter((row) => row.kind === 'folder-header' || row.kind === 'session');

    expect(rows.map((row) => (row.kind === 'session' ? `${row.renderContext}:${row.node.session.sessionId}` : row.displayName))).toEqual([
      'mixed-compact:in-folder', 'Outer', 'project:in-folder', 'project:top-level',
    ]);
  });

<<<<<<< HEAD
  test('search lists a session in work once, in the work block, and counts the tree once', () => {
    const parent = node('ses_parent', [node('ses_child'), node('ses_other')]);
    const main = group([parent]);
    const input = args([project([main])]);
    input.mode = 'search';
    input.normalizedQuery = 'ses_child';
    input.groupSearchDataByGroup.set(main, {
      filteredNodes: [parent],
      matchedSessionCount: countSessionSearchMatches([parent], 'ses_child'),
      folderNameMatchCount: 0,
      groupMatches: false,
      hasMatch: true,
    });
    input.workEntries = sessionWorks([{ ...timelineItem('ses_parent'), searchMatchCount: countSessionTreeQueryMatches(parent, 'ses_child') }]);
    input.zoneSessionIds = new Set(['ses_parent']);

    const model = buildSessionSidebarRowModel(input);
    const rows = model.rows.flatMap((row) => (row.kind === 'session' ? [row.node.session.sessionId] : []));

    expect(model.searchMatchCount).toBe(1);
    expect(rows).toEqual(['ses_parent']);
    expect(model.selectionEntries.filter((entry) => entry.id === 'ses_parent')).toHaveLength(1);
  });

||||||| bc50ba56aa
  test('search lists a session in work once, in the work block, and counts the tree once', () => {
    const parent = node('ses_parent', [node('ses_child'), node('ses_other')]);
    const main = group([parent]);
    const input = args([project([main])]);
    input.mode = 'search';
    input.normalizedQuery = 'ses_child';
    input.groupSearchDataByGroup.set(main, {
      filteredNodes: [parent],
      matchedSessionCount: countSessionSearchMatches([parent], 'ses_child'),
      folderNameMatchCount: 0,
      groupMatches: false,
      hasMatch: true,
    });
    input.workEntries = sessionWorks([{ ...timelineItem('ses_parent'), searchMatchCount: countSessionTreeQueryMatches(parent, 'ses_child') }]);
    input.zoneSessionIds = new Set(['ses_parent']);

    const model = buildSessionSidebarRowModel(input);
    const rows = model.rows.flatMap((row) => (row.kind === 'session' ? [row.node.session.id] : []));

    expect(model.searchMatchCount).toBe(1);
    expect(rows).toEqual(['ses_parent']);
    expect(model.selectionEntries.filter((entry) => entry.id === 'ses_parent')).toHaveLength(1);
  });

=======
>>>>>>> upstream/main
  test('rows carry guide lines for an open worktree and session', () => {
    const parent = node('parent', [node('child')]);
    const worktree = group([parent, node('last')], { id: 'wt', label: 'wt', isMain: false, directory: '/wt' });
    const input = args([project([group([node('root')]), worktree])]);
    input.expandedParents = new Set(['project:active:parent']);
    input.sessionOrderIndex = new Map([['root', 0], ['parent', 1], ['last', 2]]);
    const guidesOf = () => buildSessionSidebarRowModel(input).rows.flatMap((row) => (
      row.kind === 'session' ? [`${row.node.session.sessionId}:${(row.treeGuides ?? []).map(({ level, end }) => `${level}${end ? '└' : '│'}`).join(' ')}`] : []
    ));

    expect(guidesOf()).toEqual(['root:', 'parent:1│', 'child:1│ 2└', 'last:1└']);
  });

<<<<<<< HEAD
  test('search counts a subsession of a session in work once, and the moved tree leaves its group', () => {
    const parent = node('ses_parent', [node('ses_child'), node('ses_other')]);
    const main = group([parent]);
    const input = args([project([main])]);
    input.mode = 'search';
    input.normalizedQuery = 'ses_child';
    input.groupSearchDataByGroup.set(main, {
      filteredNodes: [parent],
      matchedSessionCount: countSessionSearchMatches([parent], 'ses_child'),
      folderNameMatchCount: 0,
      groupMatches: false,
      hasMatch: true,
    });
    // As the sidebar builds it: the zone row drops its children and carries
    // the count of its whole tree.
    input.workEntries = sessionWorks([{ ...timelineItem('ses_parent'), searchMatchCount: countSessionTreeQueryMatches(parent, 'ses_child') }]);
    input.zoneSessionIds = new Set(['ses_parent']);

    const model = buildSessionSidebarRowModel(input);
    const rows = model.rows.flatMap((row) => (row.kind === 'session' ? [row.node.session.sessionId] : []));

    expect(model.searchMatchCount).toBe(1);
    expect(rows).toEqual(['ses_parent']);
    // The project had no other match: no empty project header.
    expect(model.rows.some((row) => row.kind === 'project-header')).toBe(false);
  });

  test('search counts every matching subsession of a session in work', () => {
    const titled = (id: string, title: string, children: SessionNode[] = []): SessionNode => ({
      session: session(id, undefined, { title, metadata: { title } as unknown as Session['metadata'] }),
      children,
      worktree: null,
    });
    const parent = titled('ses_parent', 'Parent', [titled('ses_a', 'fix header'), titled('ses_b', 'header spacing'), titled('ses_c', 'footer')]);
    const input = args([]);
    input.mode = 'search';
    input.normalizedQuery = 'header';
    input.workEntries = sessionWorks([{ ...timelineItem('ses_parent'), node: { ...parent, children: [] }, searchMatchCount: countSessionTreeQueryMatches(parent, 'header') }]);
    input.zoneSessionIds = new Set(['ses_parent']);

    expect(buildSessionSidebarRowModel(input).searchMatchCount).toBe(2);
  });

||||||| bc50ba56aa
  test('an expanded session lists its subagents but not its workflow agents or what they started', () => {
    const agent: SessionNode = {
      session: { ...session('agent'), metadata: { openchamber: { kind: 'workflow-agent' } } },
      children: [node('agent-subagent')],
      worktree: null,
    };
    const parent = node('parent', [node('subagent'), agent]);
    const input = args([project([group([parent])])]);
    input.expandedParents = new Set(['project:active:parent', 'project:active:agent']);
    const rows = buildSessionSidebarRowModel(input).rows.flatMap((row) => (
      row.kind === 'session' ? [`${row.node.session.id}:${String(row.expanded)}`] : []
    ));
    expect(rows).toEqual(['parent:true', 'subagent:undefined']);

    const onlyAgents = args([project([group([node('lone', [agent])])])]);
    onlyAgents.expandedParents = new Set(['project:active:lone']);
    // No chevron for a row whose only children are workflow agents.
    expect(buildSessionSidebarRowModel(onlyAgents).rows.flatMap((row) => (
      row.kind === 'session' ? [`${row.node.session.id}:${String(row.expanded)}`] : []
    ))).toEqual(['lone:undefined']);
  });

  test('search counts a subsession of a session in work once, and the moved tree leaves its group', () => {
    const parent = node('ses_parent', [node('ses_child'), node('ses_other')]);
    const main = group([parent]);
    const input = args([project([main])]);
    input.mode = 'search';
    input.normalizedQuery = 'ses_child';
    input.groupSearchDataByGroup.set(main, {
      filteredNodes: [parent],
      matchedSessionCount: countSessionSearchMatches([parent], 'ses_child'),
      folderNameMatchCount: 0,
      groupMatches: false,
      hasMatch: true,
    });
    // As the sidebar builds it: the zone row drops its children and carries
    // the count of its whole tree.
    input.workEntries = sessionWorks([{ ...timelineItem('ses_parent'), searchMatchCount: countSessionTreeQueryMatches(parent, 'ses_child') }]);
    input.zoneSessionIds = new Set(['ses_parent']);

    const model = buildSessionSidebarRowModel(input);
    const rows = model.rows.flatMap((row) => (row.kind === 'session' ? [row.node.session.id] : []));

    expect(model.searchMatchCount).toBe(1);
    expect(rows).toEqual(['ses_parent']);
    // The project had no other match: no empty project header.
    expect(model.rows.some((row) => row.kind === 'project-header')).toBe(false);
  });

  test('search counts every matching subsession of a session in work', () => {
    const titled = (id: string, title: string, children: SessionNode[] = []): SessionNode => ({ session: { ...session(id), title }, children, worktree: null });
    const parent = titled('ses_parent', 'Parent', [titled('ses_a', 'fix header'), titled('ses_b', 'header spacing'), titled('ses_c', 'footer')]);
    const input = args([]);
    input.mode = 'search';
    input.normalizedQuery = 'header';
    input.workEntries = sessionWorks([{ ...timelineItem('ses_parent'), node: { ...parent, children: [] }, searchMatchCount: countSessionTreeQueryMatches(parent, 'header') }]);
    input.zoneSessionIds = new Set(['ses_parent']);

    expect(buildSessionSidebarRowModel(input).searchMatchCount).toBe(2);
  });

=======
  test('an expanded session lists its subagents but not its workflow agents or what they started', () => {
    const agent: SessionNode = {
      session: { ...session('agent'), metadata: { openchamber: { kind: 'workflow-agent' } } },
      children: [node('agent-subagent')],
      worktree: null,
    };
    const parent = node('parent', [node('subagent'), agent]);
    const input = args([project([group([parent])])]);
    input.expandedParents = new Set(['project:active:parent', 'project:active:agent']);
    const rows = buildSessionSidebarRowModel(input).rows.flatMap((row) => (
      row.kind === 'session' ? [`${row.node.session.id}:${String(row.expanded)}`] : []
    ));
    expect(rows).toEqual(['parent:true', 'subagent:undefined']);

    const onlyAgents = args([project([group([node('lone', [agent])])])]);
    onlyAgents.expandedParents = new Set(['project:active:lone']);
    // No chevron for a row whose only children are workflow agents.
    expect(buildSessionSidebarRowModel(onlyAgents).rows.flatMap((row) => (
      row.kind === 'session' ? [`${row.node.session.id}:${String(row.expanded)}`] : []
    ))).toEqual(['lone:undefined']);
  });

>>>>>>> upstream/main
  test('in work sits under Chats and above the projects', () => {
    const working = node('working');
    const input = args([project([group([working, node('other')])])]);
    input.chatGroup = group([node('chat')], { id: 'chats', directory: '/chats', folderScopeKey: '/chats' });
    input.workEntries = sessionWorks([timelineItem('working')]);

    const headers = buildSessionSidebarRowModel(input).rows.flatMap((row) => (
      row.kind === 'activity-header' ? [row.activityKey] : row.kind === 'project-header' ? [row.section.project.id] : []
    ));

    expect(headers).toEqual(['chats', 'work', 'project-a']);
  });

  test('no block while nothing is in work', () => {
    const input = args([project([group([node('other')])])]);
    input.workEntries = sessionWorks([]);
    const headers = buildSessionSidebarRowModel(input).rows.flatMap((row) => (row.kind === 'activity-header' ? [row.activityKey] : []));
    expect(headers).not.toContain('work');
  });

  test('uses occurrence keys while retaining duplicate session IDs in logical order', () => {
    const repeated = node('same-session');
    const input = args([project([group([repeated])])]);
    input.workEntries = sessionWorks([{ node: repeated, projectId: 'project-a', groupDirectory: '/repo', secondaryMeta: null }]);

    const model = buildSessionSidebarRowModel(input);
    const entries = model.selectionEntries.filter((entry) => entry.id === 'same-session');

    expect(entries).toHaveLength(2);
    expect(entries[0]?.rowKey).not.toBe(entries[1]?.rowKey);
    expect(new Set(model.rows.map((row) => row.key)).size).toBe(model.rows.length);
  });

<<<<<<< HEAD
  test('forces descendants open in search without changing persisted expansion state', () => {
    const parent = node('parent', [node('child')]);
    const main = group([parent]);
    const input = args([project([main])]);
    input.mode = 'search';
    input.normalizedQuery = 'child';
    input.groupSearchDataByGroup.set(main, {
      filteredNodes: [parent],
      matchedSessionCount: 1,
      folderNameMatchCount: 0,
      groupMatches: false,
      hasMatch: true,
    });

    const model = buildSessionSidebarRowModel(input);

    expect(model.rows.filter((row) => row.kind === 'session').map((row) => row.node.session.sessionId)).toEqual(['parent', 'child']);
    const parentEntry = model.selectionEntries.find((entry) => entry.id === 'parent');
    expect(parentEntry?.descendantRange).toBeDefined();
    expect(parentEntry?.descendantRange
      ? model.selectionDescendantIds.slice(parentEntry.descendantRange[0], parentEntry.descendantRange[1])
      : []).toEqual(['child']);
    expect(input.expandedParents.size).toBe(0);
  });

||||||| bc50ba56aa
  test('forces descendants open in search without changing persisted expansion state', () => {
    const parent = node('parent', [node('child')]);
    const main = group([parent]);
    const input = args([project([main])]);
    input.mode = 'search';
    input.normalizedQuery = 'child';
    input.groupSearchDataByGroup.set(main, {
      filteredNodes: [parent],
      matchedSessionCount: 1,
      folderNameMatchCount: 0,
      groupMatches: false,
      hasMatch: true,
    });

    const model = buildSessionSidebarRowModel(input);

    expect(model.rows.filter((row) => row.kind === 'session').map((row) => row.node.session.id)).toEqual(['parent', 'child']);
    const parentEntry = model.selectionEntries.find((entry) => entry.id === 'parent');
    expect(parentEntry?.descendantRange).toBeDefined();
    expect(parentEntry?.descendantRange
      ? model.selectionDescendantIds.slice(parentEntry.descendantRange[0], parentEntry.descendantRange[1])
      : []).toEqual(['child']);
    expect(input.expandedParents.size).toBe(0);
  });

=======
>>>>>>> upstream/main
  test('enables folder drops only when the owner scope set is authoritative', () => {
    const main = group([node('session-a')]);
    const input = args([project([main])]);
    input.foldersMap = { '/repo': [{ id: 'folder-a', name: 'Folder', sessionIds: ['session-a'], createdAt: 1 }] };

    expect(buildSessionSidebarRowModel(input).folderDropTargets[0]?.enabled).toBe(true);

    input.folderAuthorityByOwner = new Map([['project-a', { scopeKeys: ['/repo'], complete: false }]]);
    expect(buildSessionSidebarRowModel(input).folderDropTargets[0]?.enabled).toBe(false);
  });

  test('keeps a 25,000-session group bounded until show-more is requested', () => {
    const sessions = Array.from({ length: 25_000 }, (_, index) => node(`session-${index}`));
    const model = buildSessionSidebarRowModel(args([project([group(sessions)])]));

    expect(model.rows.filter((row) => row.kind === 'session')).toHaveLength(7);
    expect(model.rows.some((row) => row.kind === 'show-control' && row.more)).toBe(true);
  });

  test('single-project flat mode reveals twenty at a time and resets without changing Chats', () => {
    const nodes = Array.from({ length: 45 }, (_, index) => node(`session-${index}`));
    const input = args([project([group(nodes)])]);
    input.singleProjectMode = true;
    input.singleProjectId = 'project-a';
    input.sessionBatchSize = 20;
    input.chatGroup = group(nodes, { id: 'managed-chats' });
    for (const count of [20, 40, 45]) {
      const model = buildSessionSidebarRowModel(input);
      expect(model.rows.filter((row) => row.kind === 'session' && row.projectId === 'project-a')).toHaveLength(count);
      expect(model.rows.filter((row) => row.kind === 'session' && row.projectId === null)).toHaveLength(3);
      const control = model.rows.find((row) => row.kind === 'show-control' && row.containerKey === 'project-a:main');
      if (!control || control.kind !== 'show-control') throw new Error('Missing reveal control');
      expect(control.increment).toBe(20);
      expect({ more: control.more, fewer: control.fewer }).toEqual({ more: count < 45, fewer: count > 20 });
      if (control.more) input.visibleCountByContainer = new Map([[control.containerKey, control.currentCount + control.increment]]);
      else input.visibleCountByContainer = new Map();
    }
    expect(buildSessionSidebarRowModel(input).rows.filter((row) => row.kind === 'session' && row.projectId === 'project-a')).toHaveLength(20);
  });

  test('Chats keep the tree slot', () => {
    const input = args([]);
    input.chatGroup = group(Array.from({ length: 5 }, (_, index) => node(`chat-${index}`)), { id: 'managed-chats' });
    const rows = buildSessionSidebarRowModel(input).rows;

    expect([...new Set(rows.flatMap((row) => (row.kind === 'session' ? [row.renderContext] : [])))]).toEqual(['tree-chat']);
    expect(rows.find((row) => row.kind === 'show-control')).toMatchObject({ flat: false });
  });

  test('Chats failure stays visible beside retained sessions', () => {
    const input = args([]);
    input.chatGroup = group([node('retained-chat')], { id: 'managed-chats' });
    input.groupStatusByKey = new Map([['activity:chats', { state: 'load-failed', directory: '/chats', canGrantAccess: false }]]);
    const rows = buildSessionSidebarRowModel(input).rows;
    expect(rows.some((row) => row.kind === 'session' && row.node.session.sessionId === 'retained-chat')).toBe(true);
    expect(rows.find((row) => row.kind === 'status')).toMatchObject({ groupKey: 'activity:chats', status: { state: 'load-failed' } });
    expect(rows.some((row) => row.kind === 'empty')).toBe(false);
  });

  test('an empty Chats list loading shows on its header and adds no row', () => {
    const input = args([]);
    input.chatGroup = group([], { id: 'managed-chats' });
    input.groupStatusByKey = new Map([['activity:chats', { state: 'loading', directory: null, canGrantAccess: false }]]);
    const rows = buildSessionSidebarRowModel(input).rows;
    expect(rows.find((row) => row.kind === 'activity-header' && row.activityKey === 'chats')).toMatchObject({ loading: true });
    expect(rows.some((row) => row.kind === 'status')).toBe(false);

    // Loaded and still empty, the caption stays with its "+", and loading and
    // loaded hold the same rows, so nothing below moves.
    input.groupStatusByKey = new Map([['activity:chats', { state: 'ready', directory: null, canGrantAccess: false }]]);
    const ready = buildSessionSidebarRowModel(input);
    expect(ready.rows.find((row) => row.kind === 'activity-header' && row.activityKey === 'chats')).toMatchObject({ loading: false });
    expect(ready.stickyHeaders.some((header) => header.kind === 'activity' && header.id === 'chats')).toBe(true);
    expect(ready.rows.map((row) => row.key)).toEqual(rows.map((row) => row.key));
  });

  test('a collapsed folder retains activity coverage from nested folders without flattening subtasks', () => {
    const child = node('child');
    child.session.parentSessionId = 'parent';
    const parent = node('parent', [child]);
    const input = args([project([group([parent])])]);
    input.foldersMap = {
      '/repo': [
        { id: 'outer', name: 'Outer', createdAt: 1, sessionIds: [] },
        { id: 'inner', name: 'Inner', parentId: 'outer', createdAt: 1, sessionIds: ['parent', 'child'] },
      ]
    };
    input.collapsedFolders = new Set(['outer']);
    const model = buildSessionSidebarRowModel(input);
    const folder = model.rows.find((row) => row.kind === 'folder-header');
    if (!folder || folder.kind !== 'folder-header') throw new Error('Missing outer folder');
    expect(folder.nodes).toEqual([]);
    expect(folder.activityNodes).toEqual([parent]);
    expect(folder.activityNodes[0]?.children).toEqual([child]);
    expect(model.rows.filter((row) => row.kind === 'folder-header')).toHaveLength(1);
    expect(model.rows.some((row) => row.kind === 'session')).toBe(false);
  });

  test('sessions inside a folder sit one level deeper than ungrouped sessions', () => {
    const child = node('child');
    child.session.parentSessionId = 'in-folder';
    const input = args([project([group([node('in-folder', [child]), node('top-level')])])]);
    input.foldersMap = {
      '/repo': [
        { id: 'outer', name: 'Outer', createdAt: 1, sessionIds: [] },
        { id: 'inner', name: 'Inner', parentId: 'outer', createdAt: 1, sessionIds: ['in-folder'] },
      ]
    };
    input.expandedParents = new Set(['project:active:in-folder']);
    const rows = buildSessionSidebarRowModel(input).rows.filter((row) => row.kind === 'folder-header' || row.kind === 'session');

    expect(rows.map((row) => (row.kind === 'session' ? `${row.node.session.sessionId}@${row.depth}` : row.displayName))).toEqual([
      'Outer', 'Outer / Inner', 'in-folder@1', 'child@2', 'top-level@0',
    ]);
  });

  test('builds the folder-heavy 25,000-session projection without duplicating descendant storage', () => {
    const sessions = Array.from({ length: 25_000 }, (_, index) => node(`session-${index}`));
    const input = args([project([group(sessions)])]);
    input.foldersMap = {
      '/repo': Array.from({ length: 1_250 }, (_, folderIndex) => ({
        id: `folder-${folderIndex}`,
        name: `Folder ${folderIndex}`,
        createdAt: folderIndex,
        sessionIds: Array.from({ length: 20 }, (_, itemIndex) => `session-${folderIndex * 20 + itemIndex}`),
      })),
    };

    const model = buildSessionSidebarRowModel(input);

    expect(model.rows.filter((row) => row.kind === 'folder-header')).toHaveLength(1_250);
    expect(model.rows.filter((row) => row.kind === 'session')).toHaveLength(25_000);
    expect(model.selectionDescendantIds).toHaveLength(25_000);
    expect(model.rows).toHaveLength(26_251);
  });

  test('emits loading, failure, and permission status rows without treating them as empty success', () => {
    for (const state of ['loading', 'load-failed', 'permission-denied'] as const) {
      const main = group([]);
      const input = args([project([main])]);
      input.groupStatusByKey = new Map([['project-a:main', { state, directory: '/repo', canGrantAccess: state === 'permission-denied' }]]);
      expect(buildSessionSidebarRowModel(input).rows.some((row) => row.kind === 'status' && row.status.state === state)).toBe(true);
    }
  });

  test('resolves sticky identity from logical row ranges', () => {
    const first = project([group([node('a')])]);
    const second = { ...project([group([node('b')])]), project: { id: 'project-b', normalizedPath: '/repo-b' } };
    const model = buildSessionSidebarRowModel(args([first, second]));
    const secondHeader = model.stickyHeaders.find((header) => header.id === 'project-b');

    expect(secondHeader).toBeDefined();
    expect(resolveSessionSidebarStickyHeader(model.stickyHeaders, secondHeader?.rowIndex ?? 0)?.id).toBe('project-b');
  });

  {
    test('Chats reveal three chats and never count pinned chats against that limit', () => {
      const chats = [node('pinned-1'), node('pinned-2'), ...Array.from({ length: 6 }, (_, index) => node(`chat-${index}`))];
      const input = args([]);
      input.chatGroup = group(chats, { id: 'managed-chats' });
      input.pinnedSessionIds = pinnedIds('pinned-1', 'pinned-2');

      const model = buildSessionSidebarRowModel(input);
      const shown = model.rows.filter((row) => row.kind === 'session').map((row) => row.node.session.sessionId);

      expect(shown).toContain('pinned-1');
      expect(shown).toContain('pinned-2');
      expect(shown.filter((id) => id.startsWith('chat-'))).toHaveLength(3);
      const control = model.rows.find((row) => row.kind === 'show-control');
      expect(control).toMatchObject({ more: true, fewer: false, currentCount: 3, increment: 7 });
    });
  }

  test('pinned project sessions spend the reveal limit', () => {
    const nodes = [node('pinned-1'), node('pinned-2'), ...Array.from({ length: 8 }, (_, index) => node(`s${index}`))];
    const input = args([project([group(nodes)])]);
    input.pinnedSessionIds = pinnedIds('pinned-1', 'pinned-2');

    expect(buildSessionSidebarRowModel(input).rows.filter((row) => row.kind === 'session')).toHaveLength(7);
  });

  test('an empty worktree group is open whatever was saved, with no rows under it', () => {
    const worktree = group([], { id: 'worktree:/wt', label: 'feature', isMain: false, directory: '/wt', folderScopeKey: '/wt' });
    const input = args([project([group([node('root')]), worktree])]);
    input.collapsedGroups = new Set(['project-a:worktree:/wt']);

    const rows = buildSessionSidebarRowModel(input).rows;
    const header = rows.find((row) => row.kind === 'group-header');

    expect(header).toMatchObject({ empty: true, collapsed: false });
    expect(rows.at(-1)).toBe(header);
  });

  test('a worktree group with sessions keeps its saved collapse', () => {
    const worktree = group([node('wt-session')], { id: 'worktree:/wt', label: 'feature', isMain: false, directory: '/wt', folderScopeKey: '/wt' });
    const input = args([project([group([]), worktree])]);
    input.collapsedGroups = new Set(['project-a:worktree:/wt']);

    const rows = buildSessionSidebarRowModel(input).rows;

    expect(rows.find((row) => row.kind === 'group-header')).toMatchObject({ empty: false, collapsed: true });
    expect(rows.some((row) => row.kind === 'session')).toBe(false);
  });

  test('a folder keeps its saved collapse while its sessions are still loading', () => {
    const input = args([project([group([])])]);
    input.foldersMap = { '/repo': [{ id: 'outer', name: 'Outer', createdAt: 1, sessionIds: ['not-loaded-yet'] }] };
    input.collapsedFolders = new Set(['outer']);
    const folderRow = () => buildSessionSidebarRowModel(input).rows.find((row) => row.kind === 'folder-header');

    input.groupStatusByKey = new Map([['project-a:main', { state: 'loading', directory: null, canGrantAccess: false }]]);
    expect(folderRow()).toMatchObject({ empty: false, collapsed: true });

    input.groupStatusByKey = new Map([['project-a:main', { state: 'ready', directory: '/repo', canGrantAccess: false }]]);
    expect(folderRow()).toMatchObject({ empty: true, collapsed: false });
  });

  describe('works', () => {
    const worktree = (sessions: SessionNode[], id = 'wt') => group(sessions, {
      id: `worktree:/${id}`, label: id, branch: `feature/${id}`, isMain: false, directory: `/${id}`, folderScopeKey: `/${id}`,
      worktree: { path: `/${id}`, projectDirectory: '/repo', branch: `feature/${id}`, label: id },
    });
    const listedOf = (rows: ReturnType<typeof buildSessionSidebarRowModel>['rows']) => rows.flatMap((row) => (
      row.kind === 'activity-header' ? [`zone:${row.activityKey}`]
        : row.kind === 'project-header' ? [`project:${row.section.project.id}`]
          : row.kind === 'group-header' ? [`work:${row.group.id}@${row.depth}${row.mixed ? ':mixed' : ''}`]
            : row.kind === 'folder-header' ? [`folder:${row.displayName}`]
              : row.kind === 'session' ? [`${row.renderContext}:${row.node.session.sessionId}@${row.depth}`]
                : []
    ));

    test('a worktree is listed among the project root works at the place of its latest session, spending one slot', () => {
      // Order: wt-new (in the worktree) is the most recent session, then root-a,
      // then wt-old (an older session in that worktree's tree), then root-b.
      const work = worktree([node('wt-old', [node('wt-new')])]);
      const roots = Array.from({ length: 8 }, (_, index) => node(`r${index}`));
      const input = args([project([group(roots), work])]);
      input.sessionOrderIndex = new Map([['r0', 0], ['wt-new', 1], ['wt-old', 9], ...roots.slice(1).map((root, index) => [root.session.sessionId, index + 2] as const)]);
      input.collapsedGroups = new Set(['project-a:worktree:/wt']);

      const listed = listedOf(buildSessionSidebarRowModel(input).rows);
      expect(listed).toEqual([
        'project:project-a', 'project:r0@0', 'work:worktree:/wt@0',
        'project:r1@0', 'project:r2@0', 'project:r3@0', 'project:r4@0', 'project:r5@0',
      ]);
    });

    test('Detailed rows give the works under a project two lines, and keep what nests inside them on one', () => {
      const work = worktree([node('wt-1')]);
      const input = args([project([group([node('root', [node('child')])]), work])]);
      input.detailedZoneRows = true;
      input.expandedParents = new Set(['project:active:root']);
      input.draftsByGroupKey = new Map([
        ['project-a:main', [{ id: 'd1', directory: '/repo', projectId: 'project-a', text: 'next', mentions: [], attachments: [], createdAt: 1, updatedAt: 1 }]],
      ]);

      const detailedOf = buildSessionSidebarRowModel(input).rows.flatMap((row) => (
        row.kind === 'session' ? [`${row.node.session.sessionId}:${row.detailed === true}`]
          : row.kind === 'draft' ? [`draft:${row.detailed}`]
            : row.kind === 'group-header' ? [`work:${row.detailed}`]
              : []
      ));
      expect(detailedOf).toEqual(['draft:true', 'root:true', 'child:false', 'work:true', 'wt-1:false']);
    });

<<<<<<< HEAD
||||||| bc50ba56aa
    test('only the rows that are works of their own own their work', () => {
      const work = worktree([node('wt-1', [node('wt-child')])]);
      const input = args([project([group([node('root', [node('child')]), node('lane-1'), node('lane-2')]), work])]);
      input.runIndex = buildMultiRunIndex(['lane-1', 'lane-2'].map((id) => ({
        ...session(id),
        metadata: withMultiRunMembership({}, {
          version: 1, sessionID: id, group: { kind: 'id', id: '9f512893-6e63-4e49-a534-5de733ca103e' },
          groupSlug: 'fix-auth', role: 'run', providerID: 'anthropic', modelID: 'claude', title: 'Fix auth',
        }),
      })), () => '/repo');
      const runKey = [...input.runIndex.runs.keys()][0] ?? '';
      input.expandedParents = new Set(['mixed-compact:active:root', 'project:active:root', 'project:active:wt-1', runExpansionKey('project', runKey)]);
      input.workEntries = sessionWorks([timelineItem('root', { node: node('root', [node('child')]) })]);
      input.zoneSessionIds = new Set(['root', 'child']);

      const owners = buildSessionSidebarRowModel(input).rows.flatMap((row) => (
        row.kind === 'session' ? [`${row.renderContext}:${row.node.session.id}:${row.ownsWork}`] : []
      ));
      expect(owners).toEqual([
        'mixed-compact:root:true', 'mixed-compact:child:false',
        'project:lane-1:false', 'project:lane-2:false',
        'project:root:true', 'project:child:false',
        'project:wt-1:false', 'project:wt-child:false',
      ]);
    });

    test('a worktree stands where its archived sessions hold it', () => {
      const input = args([project([group([node('r0'), node('r1')]), worktree([node('wt-old')])])]);
      input.sessionOrderIndex = new Map([['r0', 0], ['r1', 1], ['wt-old', 2]]);
      input.worktreeArchiveAnchors = new Map([['project-a:worktree:/wt', 0.5]]);
      input.collapsedGroups = new Set(['project-a:worktree:/wt']);
      expect(listedOf(buildSessionSidebarRowModel(input).rows)).toEqual(['project:project-a', 'project:r0@0', 'work:worktree:/wt@0', 'project:r1@0']);
    });

    test('a pinned worktree is listed in Pinned after the pinned sessions, and leads its project while the section is hidden', () => {
      const pinnedWork = group([node('a1')], {
        id: 'worktree:/wt', label: 'wt', branch: 'feature/wt', isMain: false, directory: '/wt', folderScopeKey: '/wt',
        worktree: { path: '/wt', projectDirectory: '/repo', branch: 'feature/wt', label: 'wt', pinnedAt: 1 },
      });
      const input = args([project([group([node('r0'), node('pinned')]), pinnedWork])]);
      input.sessionOrderIndex = new Map([['r0', 0], ['a1', 1]]);
      input.collapsedGroups = new Set(['project-a:worktree:/wt']);
      input.pinnedItems = [timelineItem('pinned')];
      input.pinnedWorktrees = [{ kind: 'group', groupKey: 'project-a:worktree:/wt', projectId: 'project-a', group: pinnedWork }];
      input.movedSessionIds = new Set(['pinned']);
      input.movedGroupKeys = new Set(['project-a:worktree:/wt']);
      expect(listedOf(buildSessionSidebarRowModel(input).rows)).toEqual([
        'zone:pinned', 'mixed-compact:pinned@0', 'work:worktree:/wt@0:mixed', 'project:project-a', 'project:r0@0',
      ]);

      input.pinnedItems = [];
      input.pinnedWorktrees = [];
      input.movedSessionIds = new Set();
      input.movedGroupKeys = new Set();
      expect(listedOf(buildSessionSidebarRowModel(input).rows).slice(0, 3)).toEqual(['project:project-a', 'work:worktree:/wt@0', 'project:r0@0']);
    });

=======
    test('only the rows that are works of their own own their work', () => {
      const work = worktree([node('wt-1', [node('wt-child')])]);
      const input = args([project([group([node('root', [node('child')]), node('lane-1'), node('lane-2')]), work])]);
      input.runIndex = buildMultiRunIndex(['lane-1', 'lane-2'].map((id) => ({
        ...session(id),
        metadata: withMultiRunMembership({}, {
          version: 1, sessionID: id, group: { kind: 'id', id: '9f512893-6e63-4e49-a534-5de733ca103e' },
          groupSlug: 'fix-auth', role: 'run', providerID: 'anthropic', modelID: 'claude', title: 'Fix auth',
        }),
      })), () => '/repo');
      const runKey = [...input.runIndex.runs.keys()][0] ?? '';
      input.expandedParents = new Set(['mixed-compact:active:root', 'project:active:root', 'project:active:wt-1', runExpansionKey('project', runKey)]);
      input.workEntries = sessionWorks([timelineItem('root', { node: node('root', [node('child')]) })]);

      const owners = buildSessionSidebarRowModel(input).rows.flatMap((row) => (
        row.kind === 'session' ? [`${row.renderContext}:${row.node.session.id}:${row.ownsWork}`] : []
      ));
      expect(owners).toEqual([
        'mixed-compact:root:true', 'mixed-compact:child:false',
        'project:lane-1:false', 'project:lane-2:false',
        'project:root:true', 'project:child:false',
        'project:wt-1:false', 'project:wt-child:false',
      ]);
    });

    test('a worktree stands where its archived sessions hold it', () => {
      const input = args([project([group([node('r0'), node('r1')]), worktree([node('wt-old')])])]);
      input.sessionOrderIndex = new Map([['r0', 0], ['r1', 1], ['wt-old', 2]]);
      input.worktreeArchiveAnchors = new Map([['project-a:worktree:/wt', 0.5]]);
      input.collapsedGroups = new Set(['project-a:worktree:/wt']);
      expect(listedOf(buildSessionSidebarRowModel(input).rows)).toEqual(['project:project-a', 'project:r0@0', 'work:worktree:/wt@0', 'project:r1@0']);
    });

    test('a pinned worktree is listed in Pinned after the pinned sessions, and leads its project while the section is hidden', () => {
      const pinnedWork = group([node('a1')], {
        id: 'worktree:/wt', label: 'wt', branch: 'feature/wt', isMain: false, directory: '/wt', folderScopeKey: '/wt',
        worktree: { path: '/wt', projectDirectory: '/repo', branch: 'feature/wt', label: 'wt', pinnedAt: 1 },
      });
      const input = args([project([group([node('r0'), node('pinned')]), pinnedWork])]);
      input.sessionOrderIndex = new Map([['r0', 0], ['a1', 1]]);
      input.collapsedGroups = new Set(['project-a:worktree:/wt']);
      input.pinnedItems = [timelineItem('pinned')];
      input.pinnedWorktrees = [{ kind: 'group', groupKey: 'project-a:worktree:/wt', projectId: 'project-a', group: pinnedWork }];
      input.movedSessionIds = new Set(['pinned']);
      input.movedGroupKeys = new Set(['project-a:worktree:/wt']);
      expect(listedOf(buildSessionSidebarRowModel(input).rows)).toEqual([
        'zone:pinned', 'mixed-compact:pinned@0', 'work:worktree:/wt@0:mixed', 'project:project-a', 'project:r0@0',
      ]);

      input.pinnedItems = [];
      input.pinnedWorktrees = [];
      input.movedSessionIds = new Set();
      input.movedGroupKeys = new Set();
      expect(listedOf(buildSessionSidebarRowModel(input).rows).slice(0, 3)).toEqual(['project:project-a', 'work:worktree:/wt@0', 'project:r0@0']);
    });

>>>>>>> upstream/main
    test('a worktree with no session closes the project root list', () => {
      const input = args([project([group([node('root')]), worktree([])])]);
      input.sessionOrderIndex = new Map([['root', 0]]);
      expect(listedOf(buildSessionSidebarRowModel(input).rows)).toEqual(['project:project-a', 'project:root@0', 'work:worktree:/wt@0']);
    });

    test('a session work In work lists leaves its project when the collection moves it', () => {
      const input = args([project([group([node('working'), node('other')])])]);
      input.workEntries = sessionWorks([timelineItem('working')]);
      input.movedSessionIds = new Set(['working']);

      expect(listedOf(buildSessionSidebarRowModel(input).rows)).toEqual([
        'zone:work', 'mixed-compact:working@0', 'project:project-a', 'project:other@0',
      ]);
    });

    test('a worktree work In work lists is its group row naming its project, out of the drag sort, and leaves its project', () => {
      const work = worktree([node('a1'), node('a2')]);
      const input = args([project([group([node('root')]), work])]);
      input.workEntries = [{ kind: 'group', groupKey: 'project-a:worktree:/wt', projectId: 'project-a', group: work }];
      input.movedGroupKeys = new Set(['project-a:worktree:/wt']);

      const model = buildSessionSidebarRowModel(input);
      expect(listedOf(model.rows)).toEqual([
        'zone:work', 'work:worktree:/wt@0:mixed', 'project:a1@1', 'project:a2@1', 'project:project-a', 'project:root@0',
      ]);
    });

    test('a worktree work kept in its project too keeps every row key unique and shares its collapse', () => {
      const work = worktree([node('a1')]);
      const input = args([project([group([]), work])]);
      input.workEntries = [{ kind: 'group', groupKey: 'project-a:worktree:/wt', projectId: 'project-a', group: work }];
      input.collapsedGroups = new Set(['project-a:worktree:/wt']);

      const model = buildSessionSidebarRowModel(input);
      const headers = model.rows.filter((row) => row.kind === 'group-header');
      expect(headers.map((row) => row.kind === 'group-header' && `${row.mixed}:${row.collapsed}`)).toEqual(['true:true', 'false:true']);
      expect(new Set(model.rows.map((row) => row.key)).size).toBe(model.rows.length);
    });

    test('the list by time lists the works of every project in one zone, without project headers', () => {
      const work = worktree([node('a1')]);
      const second: ProjectSection = { project: { id: 'project-b', normalizedPath: '/other' }, groups: [group([], { directory: '/other' })] };
      const input = args([project([group([node('root')]), work]), second]);
      input.pinnedItems = [timelineItem('pinned')];
      input.workEntries = sessionWorks([timelineItem('working')]);
      input.timeEntries = [
        { kind: 'session', item: timelineItem('b1', { projectId: 'project-b' }) },
        { kind: 'group', groupKey: 'project-a:worktree:/wt', projectId: 'project-a', group: work },
        { kind: 'session', item: timelineItem('root') },
      ];

      expect(listedOf(buildSessionSidebarRowModel(input).rows)).toEqual([
        'zone:pinned', 'mixed-compact:pinned@0', 'zone:work', 'mixed-compact:working@0',
        'zone:timeline', 'mixed-compact:b1@0', 'work:worktree:/wt@0:mixed', 'project:a1@1', 'mixed-compact:root@0',
      ]);

      input.collapsedActivities = new Set(['timeline']);
      expect(listedOf(buildSessionSidebarRowModel(input).rows).slice(-1)).toEqual(['zone:timeline']);
    });

    test('the list by time shows one line while sessions load and one per failed directory', () => {
      const second: ProjectSection = { project: { id: 'project-b', normalizedPath: '/other' }, groups: [group([], { directory: '/other' })] };
      const third: ProjectSection = { project: { id: 'project-c', normalizedPath: '/third' }, groups: [group([], { directory: '/third' })] };
      const input = args([project([group([])]), second, third]);
      input.timeEntries = [];
      input.groupStatusByKey = new Map([
        ['project-a:main', { state: 'loading' as const, directory: null, canGrantAccess: false }],
        ['project-b:main', { state: 'loading' as const, directory: null, canGrantAccess: false }],
        ['project-c:main', { state: 'load-failed' as const, directory: '/third', canGrantAccess: false }],
      ]);

      const statusesOf = () => buildSessionSidebarRowModel(input).rows.flatMap((row) => (row.kind === 'status' ? [`${row.status.state}:${row.groupKey}`] : []));
      expect(statusesOf()).toEqual(['loading:project-a:main', 'load-failed:project-c:main']);

      // A project with listed works needs no line, as under its own header.
      input.timeEntries = sessionWorks([timelineItem('a1')]);
      expect(statusesOf()).toEqual(['loading:project-b:main', 'load-failed:project-c:main']);
    });

    test('single-project mode keeps its project and picker whatever the grouping', () => {
      const input = args([project([group([node('root')])])]);
      input.singleProjectMode = true;
      input.singleProjectId = 'project-a';
      input.timeEntries = sessionWorks([timelineItem('root')]);

      expect(listedOf(buildSessionSidebarRowModel(input).rows)).toEqual(['project:project-a', 'project:root@0']);
    });

    test('a worktree filed into a folder of the project root renders inside it, and only there', () => {
      const work = worktree([node('a1')]);
      const input = args([project([group([node('root')]), work])]);
      input.foldersMap = { '/repo': [{ id: 'f', name: 'Releases', createdAt: 1, sessionIds: ['worktree:/wt'] }] };

      expect(listedOf(buildSessionSidebarRowModel(input).rows)).toEqual([
        'project:project-a', 'folder:Releases', 'work:worktree:/wt@1', 'project:a1@2', 'project:root@0',
      ]);

      // Folded away In work, the folder holds nothing of it.
      input.movedGroupKeys = new Set(['project-a:worktree:/wt']);
      input.workEntries = [{ kind: 'group', groupKey: 'project-a:worktree:/wt', projectId: 'project-a', group: work }];
      expect(listedOf(buildSessionSidebarRowModel(input).rows)).toEqual([
        'zone:work', 'work:worktree:/wt@0:mixed', 'project:a1@1', 'project:project-a', 'folder:Releases', 'project:root@0',
      ]);
    });
  });

  describe('multi-run rows', () => {
    const runMember = (id: string): Session => ({
      ...session(id),
      metadata: withMultiRunMembership({ metadata: null }, {
        version: 1, sessionID: id, group: { kind: 'id', id: '9f512893-6e63-4e49-a534-5de733ca103e' },
        groupSlug: 'fix-auth', role: 'run', providerID: 'anthropic', modelID: 'claude', title: 'Fix auth',
      }),
    });
    const runIndex = buildMultiRunIndex([runMember('lane-1'), runMember('lane-2')], () => '/repo');
    const runKey = [...runIndex.runs.keys()][0] ?? '';

    test('a run In work lists is one row even when a worktree work sits between its members', () => {
      const work = group([node('wt-1')], {
        id: 'worktree:/wt', label: 'wt', branch: 'feature/wt', isMain: false, directory: '/wt', folderScopeKey: '/wt',
        worktree: { path: '/wt', projectDirectory: '/repo', branch: 'feature/wt', label: 'wt' },
      });
      const input = args([project([group([node('lane-1'), node('lane-2')]), work])]);
      input.runIndex = runIndex;
      input.workEntries = [
        { kind: 'session', item: timelineItem('lane-1') },
        { kind: 'group', groupKey: 'project-a:worktree:/wt', projectId: 'project-a', group: work },
        { kind: 'session', item: timelineItem('lane-2') },
      ];
      input.movedSessionIds = new Set(['lane-1', 'lane-2']);
      input.movedGroupKeys = new Set(['project-a:worktree:/wt']);
      const runRows = buildSessionSidebarRowModel(input).rows.filter((row) => row.kind === 'run');
      expect(runRows).toHaveLength(1);
      expect(runRows[0]?.kind === 'run' && runRows[0].laneNodes.map((lane) => lane.session.sessionId)).toEqual(['lane-1', 'lane-2']);
    });

    test('lanes collapse into one run row at the first lane, outside selection', () => {
      const input = args([project([group([node('lane-1'), node('other'), node('lane-2')])])]);
      input.runIndex = runIndex;
      const model = buildSessionSidebarRowModel(input);
      const listed = model.rows.flatMap((row) => (row.kind === 'run' ? [`run:${row.run.title}`] : row.kind === 'session' ? [row.node.session.sessionId] : []));

      expect(listed).toEqual(['run:Fix auth', 'other']);
      expect(model.selectionEntries.map((entry) => entry.id)).toEqual(['other']);
    });

    test('an expanded run lists its lanes one level deeper', () => {
      const input = args([project([group([node('lane-1'), node('lane-2')])])]);
      input.runIndex = runIndex;
      input.expandedParents = new Set([runExpansionKey('project', runKey)]);
      const rows = buildSessionSidebarRowModel(input).rows.filter((row) => row.kind === 'run' || row.kind === 'session');

      expect(rows.map((row) => (row.kind === 'session' ? `${row.node.session.sessionId}@${row.depth}` : `run@${row.depth}`))).toEqual(['run@0', 'lane-1@1', 'lane-2@1']);
    });

    test('a run inside a folder and its lanes sit one level deeper', () => {
      const input = args([project([group([node('lane-1'), node('lane-2')])])]);
      input.runIndex = runIndex;
      input.foldersMap = { '/repo': [{ id: 'folder-a', name: 'Folder', createdAt: 1, sessionIds: ['lane-1', 'lane-2'] }] };
      input.expandedParents = new Set([runExpansionKey('project', runKey)]);
      const rows = buildSessionSidebarRowModel(input).rows.filter((row) => row.kind === 'run' || row.kind === 'session');

      expect(rows.map((row) => (row.kind === 'session' ? `${row.node.session.sessionId}@${row.depth}` : `run@${row.depth}`))).toEqual(['run@1', 'lane-1@2', 'lane-2@2']);
    });

    test('a run spends one slot of the reveal limit', () => {
      const nodes = [node('lane-1'), node('lane-2'), ...Array.from({ length: 7 }, (_, index) => node(`s${index}`))];
      const input = args([project([group(nodes)])]);
      input.runIndex = runIndex;
      const model = buildSessionSidebarRowModel(input);

      expect(model.rows.filter((row) => row.kind === 'run')).toHaveLength(1);
      expect(model.rows.filter((row) => row.kind === 'session')).toHaveLength(6);
    });

    test('an In work run row opens to its lanes as one-line rows and carries the sessions that block them', () => {
      const input = args([]);
      input.runIndex = runIndex;
      input.detailedZoneRows = true;
      input.workEntries = sessionWorks([
        timelineItem('lane-1', { blockingBadgeSessionScopes: [{ directory: '/repo', sessionIDs: ['lane-1', 'lane-1-child'] }] }),
        timelineItem('lane-2', { blockingBadgeSessionScopes: [{ directory: '/repo', sessionIDs: ['lane-2'] }] }),
      ]);
      const run = buildSessionSidebarRowModel(input).rows.find((row) => row.kind === 'run');
      expect(run?.kind === 'run' && [...run.blockingSessionIds]).toEqual(['lane-1', 'lane-1-child', 'lane-2']);
      expect(run).toMatchObject({ detailed: true, expanded: false });

      input.expandedParents = new Set([runExpansionKey('timeline-mixed', runKey)]);
      const lanes = buildSessionSidebarRowModel(input).rows.flatMap((row) => (row.kind === 'session' ? [`${row.node.session.sessionId}:${row.renderContext}`] : []));
      expect(lanes).toEqual(['lane-1:mixed-compact', 'lane-2:mixed-compact']);
    });

  });

  describe('zone selection scope', () => {
    const lane = (id: string): Session => ({
      ...session(id),
      metadata: withMultiRunMembership({}, {
        version: 1, sessionID: id, group: { kind: 'id', id: '9f512893-6e63-4e49-a534-5de733ca103e' },
        groupSlug: 'fix-auth', role: 'run', providerID: 'anthropic', modelID: 'claude', title: 'Fix auth',
      }),
    });

    test('every row a zone lists selects within that zone, and select all stays inside it', () => {
      const work = group([node('wt-1')], {
        id: 'worktree:/wt', label: 'wt', branch: 'feature/wt', isMain: false, directory: '/wt', folderScopeKey: '/wt',
        worktree: { path: '/wt', projectDirectory: '/repo', branch: 'feature/wt', label: 'wt' },
      });
      const input = args([project([group([node('other'), node('lane-1'), node('lane-2')]), work])]);
      input.runIndex = buildMultiRunIndex([lane('lane-1'), lane('lane-2')], () => '/repo');
      const runKey = [...input.runIndex.runs.keys()][0] ?? '';
      input.pinnedItems = [timelineItem('pinned')];
      input.workEntries = [
        { kind: 'session', item: timelineItem('working', { node: node('working', [node('btw')]) }) },
        { kind: 'session', item: timelineItem('lane-1') },
        { kind: 'session', item: timelineItem('lane-2') },
        { kind: 'group', groupKey: 'project-a:worktree:/wt', projectId: 'project-a', group: work },
      ];
      input.movedSessionIds = new Set(['pinned', 'working', 'lane-1', 'lane-2']);
      input.movedGroupKeys = new Set(['project-a:worktree:/wt']);
      input.expandedParents = new Set(['mixed-compact:active:working', runExpansionKey('mixed-compact', runKey)]);
      input.sessionOwnerById = new Map([['wt-1', { projectId: 'project-a', projectRoot: '/repo', scopeDirectory: '/wt', kind: 'worktree' }]]);

      const model = buildSessionSidebarRowModel(input);
      const scopeOf = (id: string) => model.selectionEntries.find((entry) => entry.id === id)?.scopeKey;

      expect(['working', 'btw', 'lane-1', 'lane-2', 'wt-1'].map(scopeOf)).toEqual(Array(5).fill('activity:work'));
      expect(scopeOf('pinned')).toBe('activity:pinned');
      expect(scopeOf('other')).toBeNull();
      // Folder ownership stays the session's own.
      expect(model.rows.find((row) => row.kind === 'session' && row.node.session.id === 'wt-1')).toMatchObject({ ownerKey: getWorkFolderOwnerKey('/wt') });

      const all = deriveSessionRowBulkSelectAll(model.selectionEntries, model.selectionDescendantIds, 'activity:work');
      expect([...(all?.ids ?? [])].sort()).toEqual(['btw', 'lane-1', 'lane-2', 'working', 'wt-1']);
    });

    test('select all takes the sessions of folded worktree works and runs in the zone without unfolding them', () => {
      const work = group([node('wt-1', [node('wt-1-child', [])])], {
        id: 'worktree:/wt', label: 'wt', branch: 'feature/wt', isMain: false, directory: '/wt', folderScopeKey: '/wt',
        worktree: { path: '/wt', projectDirectory: '/repo', branch: 'feature/wt', label: 'wt' },
      });
      const input = args([project([group([node('other'), node('lane-1'), node('lane-2')]), work])]);
      input.runIndex = buildMultiRunIndex([lane('lane-1'), lane('lane-2')], () => '/repo');
      input.pinnedItems = [timelineItem('pinned')];
      input.workEntries = [
        { kind: 'session', item: timelineItem('working') },
        { kind: 'session', item: timelineItem('lane-1') },
        { kind: 'session', item: timelineItem('lane-2') },
        { kind: 'group', groupKey: 'project-a:worktree:/wt', projectId: 'project-a', group: work },
      ];
      input.movedSessionIds = new Set(['pinned', 'working', 'lane-1', 'lane-2']);
      input.movedGroupKeys = new Set(['project-a:worktree:/wt']);
      input.collapsedGroups = new Set(['project-a:worktree:/wt']);

      const model = buildSessionSidebarRowModel(input);
      const sessionRows = model.rows.flatMap((row) => (row.kind === 'session' ? [row.node.session.id] : []));

      // Folded: neither the run's lanes nor the worktree's sessions get rows.
      expect(sessionRows.filter((id) => ['lane-1', 'lane-2', 'wt-1', 'wt-1-child'].includes(id))).toEqual([]);
      const all = deriveSessionRowBulkSelectAll(model.selectionEntries, model.selectionDescendantIds, 'activity:work');
      expect([...(all?.ids ?? [])].sort()).toEqual(['lane-1', 'lane-2', 'working', 'wt-1', 'wt-1-child']);
      // Folded sessions have no row, so a Shift range never lands on them.
      expect(model.selectionEntries.filter((entry) => entry.rowKey === null).map((entry) => entry.id).sort()).toEqual(['lane-1', 'lane-2', 'wt-1']);
      expect(model.selectionWorks.map((entry) => entry.group.id)).toEqual(['worktree:/wt']);
    });

    test('select all in the zone takes what Show more and a folded folder hold back in an open worktree work', () => {
      const ids = Array.from({ length: 12 }, (_, index) => `wt-${index}`);
      const work = group(ids.map((id) => node(id)), {
        id: 'worktree:/wt', label: 'wt', branch: 'feature/wt', isMain: false, directory: '/wt', folderScopeKey: '/wt',
        worktree: { path: '/wt', projectDirectory: '/repo', branch: 'feature/wt', label: 'wt' },
      });
      const input = args([project([group([node('other')]), work])]);
      input.workEntries = [{ kind: 'group', groupKey: 'project-a:worktree:/wt', projectId: 'project-a', group: work }];
      input.movedGroupKeys = new Set(['project-a:worktree:/wt']);
      input.foldersMap = { '/wt': [{ id: 'kept', name: 'Kept', createdAt: 1, sessionIds: ['wt-11'] }] };
      input.collapsedFolders = new Set(['kept']);

      const model = buildSessionSidebarRowModel(input);
      const sessionRows = model.rows.flatMap((row) => (row.kind === 'session' ? [row.node.session.id] : []));
      expect(sessionRows.filter((id) => id.startsWith('wt-')).length).toBeLessThan(11);
      expect(sessionRows).not.toContain('wt-11');
      const all = deriveSessionRowBulkSelectAll(model.selectionEntries, model.selectionDescendantIds, 'activity:work');
      expect([...(all?.ids ?? [])].sort()).toEqual([...ids].sort());
    });

    test('the list by time is a zone of its own, apart from In work above it', () => {
      const input = args([project([group([node('t1'), node('t2')])])]);
      input.workEntries = sessionWorks([timelineItem('working')]);
      input.timeEntries = sessionWorks([timelineItem('t1'), timelineItem('t2')]);
      const model = buildSessionSidebarRowModel(input);

      expect(model.selectionEntries.map((entry) => `${entry.id}:${entry.scopeKey}`))
        .toEqual(['working:activity:work', 't1:activity:timeline', 't2:activity:timeline']);
      expect(deriveSessionRowBulkSelectAll(model.selectionEntries, model.selectionDescendantIds, 'activity:timeline')?.ids).toEqual(['t1', 't2']);
    });
  });

  test('retains current session authority when presentation filters the row out', () => {
    const authoritative = project([group([node('hidden')])]);
    const input = args([]);
    input.authoritativeSections = [authoritative];

    expect(buildSessionSidebarRowModel(input).sessionById.get('hidden')?.sessionId).toBe('hidden');
  });
});
<<<<<<< HEAD
||||||| bc50ba56aa

const originalHomeInfo = opencodeClient.getFilesystemHomeInfo;
opencodeClient.getFilesystemHomeInfo = async () => ({
  home: '/home',
  canonicalChatsRoot: '/home/.config/openchamber/chats',
  canonicalLegacyChatsRoot: '/home/.config/openchamber/chats',
});
await ensureChatsRootDirectory();
opencodeClient.getFilesystemHomeInfo = originalHomeInfo;
=======

const originalHomeInfo = opencodeClient.getFilesystemHomeInfo;
opencodeClient.getFilesystemHomeInfo = async () => ({
  home: '/home',
  canonicalChatsRoot: '/home/.config/openchamber/chats',
  canonicalLegacyChatsRoot: '/home/.config/openchamber/chats',
});
await ensureChatsRootDirectory();
opencodeClient.getFilesystemHomeInfo = originalHomeInfo;

describe('the Pages section', () => {
  const pages = [{ id: 'source-board', open: false }, { id: 'scheduled', open: true }, { id: 'archive', open: false }, { id: 'guest:notes', open: false }];

  test('lists each page in its order under its caption, with the open one marked, and stays out of selection', () => {
    const input = args([project([group([node('s1')])])]);
    input.blocks = [{ kind: 'pages', pages }, { kind: 'projects' }];
    const model = buildSessionSidebarRowModel(input);
    expect(model.rows[0]).toMatchObject({ kind: 'activity-header', activityKey: 'pages', collapsed: false });
    const pageRows = model.rows.filter((row) => row.kind === 'page');
    expect(pageRows.map((row) => [row.pageId, row.open])).toEqual([['source-board', false], ['scheduled', true], ['archive', false], ['guest:notes', false]]);
    expect(model.rows.slice(1, 5).every((row) => row.kind === 'page')).toBe(true);
    expect(model.selectionEntries.map((entry) => entry.id)).toEqual(['s1']);
  });

  test('collapsed, it keeps its caption only', () => {
    const input = args([]);
    input.blocks = [{ kind: 'pages', pages }];
    input.collapsedActivities = new Set(['pages']);
    const rows = buildSessionSidebarRowModel(input).rows;
    expect(rows[0]).toMatchObject({ kind: 'activity-header', activityKey: 'pages', collapsed: true });
    expect(rows.some((row) => row.kind === 'page')).toBe(false);
  });

  test('with no page it draws nothing', () => {
    const input = args([project([group([node('s1')])])]);
    input.blocks = [{ kind: 'pages', pages: [] }, { kind: 'projects' }];
    const rows = buildSessionSidebarRowModel(input).rows;
    expect(rows.some((row) => row.kind === 'page' || (row.kind === 'activity-header' && row.activityKey === 'pages'))).toBe(false);
  });

  test('a sidebar with pages and no work still shows its empty state', () => {
    const input = args([]);
    input.blocks = [{ kind: 'pages', pages }, { kind: 'projects' }];
    const rows = buildSessionSidebarRowModel(input).rows;
    expect(rows.at(-1)).toMatchObject({ kind: 'empty', emptyKind: 'sidebar' });
  });

  test('a search lists matches only, without the pages', () => {
    const input = args([project([group([node('s1')])])]);
    input.blocks = [{ kind: 'pages', pages }, { kind: 'projects' }];
    input.mode = 'search';
    input.contentSearchResults = [];
    const rows = buildSessionSidebarRowModel(input).rows;
    expect(rows.some((row) => row.kind === 'page' || (row.kind === 'activity-header' && row.activityKey === 'pages'))).toBe(false);
  });
});
>>>>>>> upstream/main
