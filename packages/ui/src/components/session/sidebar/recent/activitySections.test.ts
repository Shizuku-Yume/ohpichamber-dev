import { afterEach, describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { countSessionTreeQueryMatches, deriveTimelineActivityItems, matchZoneSessionsForSidebarQuery, pruneSessionTreeForSidebarQuery } from './activitySections';
import type { SessionNode } from '../types';

afterEach(() => resetWorkspaceDirectories());

const session = (sessionId: string, parentSessionId?: string): Session => {
  registerWorkspaceDirectory('workspace', '/workspace');
  return {
    sessionId,
    projectId: 'project',
    workspaceId: 'workspace',
    displayPath: '/workspace',
    parentSessionId,
    rootSessionId: parentSessionId ?? sessionId,
    createdAt: 1,
    updatedAt: 1,
    epoch: '1',
    headSequence: '0',
    runtimeStatus: 'idle',
    activeRunId: null,
    mode: { kind: 'main' },
    metadata: null,
    metadataRevision: '0',
    archiveRevision: '0',
  };
};

const tree = (): SessionNode => ({
  session: { ...session('ses_parent'), title: 'Parent work' },
  children: [{
    session: { ...session('ses_child', 'ses_parent'), title: 'Fix the header' },
    children: [],
    worktree: null,
  }],
  worktree: null,
});

describe('pruneSessionTreeForSidebarQuery', () => {
  test('keeps a matching tree whole and prunes the branches that lead nowhere', () => {
    const root = tree();
    expect(pruneSessionTreeForSidebarQuery(root, 'parent')).toBe(root);
    expect(pruneSessionTreeForSidebarQuery(root, 'ses_child')?.children)
      .toEqual(root.children);
    expect(pruneSessionTreeForSidebarQuery(root, 'unrelated')).toBeNull();
    expect(pruneSessionTreeForSidebarQuery(root, 'ses_other')).toBeNull();
  });
});

describe('countSessionTreeQueryMatches', () => {
  test('counts the sessions that answer the query themselves, ancestors excluded', () => {
    const root = tree();
    expect(countSessionTreeQueryMatches(root, 'ses_child')).toBe(1);
    expect(countSessionTreeQueryMatches(root, 'header')).toBe(1);
    expect(countSessionTreeQueryMatches(root, 'ses_parent')).toBe(1);
    expect(countSessionTreeQueryMatches(root, 'unrelated')).toBe(0);
  });
});

describe('matchZoneSessionsForSidebarQuery', () => {
  test('filters a zone by its tree or by the session alone, counting the matches', () => {
    const parent = session('ses_parent');
    const unrelated = session('ses_unrelated');
    const getTree = (entry: Session) => (entry.sessionId === parent.sessionId ? tree() : { session: entry, children: [], worktree: null });

    expect(matchZoneSessionsForSidebarQuery([parent, unrelated], getTree, 'header', 'tree').sessions)
      .toEqual([parent]);
    expect(matchZoneSessionsForSidebarQuery([parent, unrelated], getTree, 'header', 'session').sessions)
      .toEqual([]);
    expect([...matchZoneSessionsForSidebarQuery([parent, unrelated], getTree, '', 'tree').matchCountById])
      .toEqual([]);
  });
});

describe('deriveTimelineActivityItems', () => {
  test('shapes one item per matching session and leaves the row metadata to the caller', () => {
    const parent = { ...session('ses_parent'), title: 'Release' };
    const other = { ...session('ses_other'), title: 'Investigate' };

    const items = deriveTimelineActivityItems({
      sessions: [parent, other],
      getSessionLocation: (sessionId) => sessionId === parent.sessionId ? {
        projectId: 'app',
        groupDirectory: '/workspace/app',
        projectLabel: 'App',
        branchLabel: 'release',
        inSpace: false,
        worktree: null,
      } : null,
      getSessionNode: (entry) => ({ session: entry, children: [], worktree: null }),
      query: 'release',
    });

    expect(items).toMatchObject([{
      node: { session: parent, children: [], worktree: null },
      projectId: 'app',
      groupDirectory: '/workspace/app',
      secondaryMeta: { projectLabel: 'App', branchLabel: 'release' },
    }]);
  });
});
