import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import type { WorktreeMetadata } from '@/types/worktree';
import { resolveSessionPrLookup } from '../sessions/sessionNodeItemUtils';
import { deriveRecentActivitySections, deriveRecentSessions, sessionTreeMatchesSidebarQuery } from './activitySections';
import { resolveSidebarSessionLocations } from './sessionLocation';
import type { SessionNode } from '../types';
import type { DirectoryOwner } from '../sessions/sessionOwnership';

const NOW = 200_000_000;
const RECENT = NOW - (48 * 60 * 60 * 1000);
const OLD = NOW - (72 * 60 * 60 * 1000);

const session = (sessionId: string, options: { parentSessionId?: string; archived?: number; updated?: number } = {}): Session => ({
  sessionId,
  projectId: 'project',
  workspaceId: 'workspace',
  displayPath: '/workspace',
  parentSessionId: options.parentSessionId,
  rootSessionId: options.parentSessionId ? 'parent' : sessionId,
  createdAt: OLD,
  updatedAt: options.updated ?? OLD,
  epoch: '1',
  headSequence: '0',
  runtimeStatus: 'idle',
  activeRunId: null,
  metadata: null,
  metadataRevision: '0',
  archiveRevision: options.archived === undefined ? '0' : '1',
});

describe('deriveRecentSessions', () => {
  test('includes an old root session while it is active', () => {
    const oldActive = session('old-active');

    expect(deriveRecentSessions([oldActive], new Set([oldActive.sessionId]), NOW)).toEqual([oldActive]);
  });

  test('does not promote active children or archived sessions into Recent', () => {
    const child = session('child', { parentSessionId: 'parent' });
    const archived = session('archived', { archived: NOW - 1 });

    expect(deriveRecentSessions(
      [child, archived],
      new Set([child.sessionId, archived.sessionId]),
      NOW,
    )).toEqual([]);
  });

  test('keeps inactive membership timestamp-based', () => {
    const oldSession = session('old');
    const recentSession = session('recent', { updated: RECENT });

    expect(deriveRecentSessions([oldSession, recentSession], new Set(), NOW)).toEqual([recentSession]);
  });
});

describe('deriveRecentActivitySections', () => {
  test('matches full IDs only, without falling back to titles or changing the matched subtree', () => {
    const target = { ...session('ses_f88b1a2b3c4d'), metadata: { title: 'Release' } };
    const other = { ...session('ses_f88b1a2b3c4e'), metadata: { title: target.sessionId } };
    const node = { session: target, worktree: null, children: [{ session: other, worktree: null, children: [] }] };
    for (const query of [target.sessionId, ` ${target.sessionId.toUpperCase()} `, 'ses_f88b', 'ses_f88b1a2b3c4f']) {
      const sections = deriveRecentActivitySections({
        sessions: [target, other],
        getSessionLocation: () => null,
        getSessionNode: () => node,
        query,
      });
      const expected = query.trim().toLowerCase() === target.sessionId ? [target.sessionId] : [];
      expect(sections[0].items.map((item) => item.node.session.sessionId)).toEqual(expected);
      for (const item of sections[0].items) expect(item.node).toBe(node);
    }
    expect(node.children).toHaveLength(1);
  });

  test('filters recent roots by search text and falls back to topology metadata', () => {
    const matching = {
      ...session('matching', { updated: RECENT }),
      metadata: { title: 'Deploy release' },
      displayPath: '/workspace/app/worktrees/release',
    };
    const excluded = {
      ...session('excluded', { updated: RECENT }),
      metadata: { title: 'Investigate failure' },
      displayPath: '/workspace/app',
    };

    const sections = deriveRecentActivitySections({
      sessions: [matching, excluded],
      getSessionLocation: (sessionId) => sessionId === matching.sessionId ? {
        projectId: 'app',
        groupDirectory: '/workspace/app/worktrees/release',
        projectLabel: 'App',
        branchLabel: 'release',
        inSpace: false,
        worktree: null,
      } : null,
      query: 'deploy',
    });

    expect(sections).toMatchObject([{
      key: 'active-now',
      items: [{
        node: { session: matching, children: [], worktree: null },
        projectId: 'app',
        groupDirectory: '/workspace/app/worktrees/release',
        secondaryMeta: { projectLabel: 'App', branchLabel: 'release' },
      }],
    }]);
  });

  test('attaches the location worktree to the node so the row derives its PR key', () => {
    const record = { ...session('worktree', { updated: RECENT }), displayPath: '/worktrees/feature' };
    const worktree: WorktreeMetadata = {
      path: '/worktrees/feature', projectDirectory: '/workspace/app', branch: 'feature-1', label: 'feature',
    };

    const sections = deriveRecentActivitySections({
      sessions: [record],
      getSessionLocation: (sessionId) => sessionId === record.sessionId ? {
        projectId: 'app',
        groupDirectory: '/worktrees/feature',
        projectLabel: 'App',
        branchLabel: 'feature-1',
        inSpace: false,
        worktree,
      } : null,
      // `buildActiveSessionNode` hands Recent rows a null worktree; the Recent
      // projection must carry the resolved one onto the node.
      getSessionNode: (target) => ({ session: target, children: [], worktree: null }),
      query: '',
    });

    const node = sections[0].items[0]?.node;
    expect(node?.worktree).toBe(worktree);
    expect(resolveSessionPrLookup(node?.worktree))
      .toEqual({ directory: '/worktrees/feature', branch: 'feature-1' });
  });

  test('keeps the node unchanged when no location resolved a worktree', () => {
    const record = session('plain', { updated: RECENT });
    const node = { session: record, children: [], worktree: null };

    const sections = deriveRecentActivitySections({
      sessions: [record],
      getSessionLocation: () => null,
      getSessionNode: () => node,
      query: '',
    });

    expect(sections[0].items[0]?.node).toBe(node);
  });

  test('resolves child and grandchild PR keys from their own worktrees without losing the subtree', () => {
    const root = { ...session('root'), displayPath: '/workspace/app' };
    const child = { ...session('child', { parentSessionId: 'root' }), displayPath: '/worktrees/feature' };
    const grandchild = { ...session('grandchild', { parentSessionId: 'child' }), displayPath: '/worktrees/other/sub' };
    const missing = { ...session('missing', { parentSessionId: 'root' }), displayPath: '/worktrees/deleted' };
    const worktree: WorktreeMetadata = {
      path: '/worktrees/feature', projectDirectory: '/workspace/app', branch: 'feature', label: 'feature',
    };
    const otherWorktree: WorktreeMetadata = { ...worktree, path: '/worktrees/other', branch: 'other' };
    const owner: DirectoryOwner = {
      projectId: 'app', projectRoot: '/workspace/app', scopeDirectory: '/workspace/app', kind: 'project',
    };
    const locations = resolveSidebarSessionLocations({
      sessions: [root, child, grandchild, missing],
      projects: [{ id: 'app', normalizedPath: '/workspace/app' }],
      ownerBySessionId: new Map([root, child, grandchild, missing].map((record) => [
        record.sessionId, owner,
      ])),
      availableWorktreesByProject: new Map([['/workspace/app', [worktree, otherWorktree]]]),
      gitBranches: new Map(),
      homeDirectory: null,
      hideBranchMatchingProjectLabel: true,
    });
    const missingNode: SessionNode = { session: missing, worktree: null, children: [] };
    const original: SessionNode = {
      session: root, worktree: null,
      children: [{ session: child, worktree: null, children: [{ session: grandchild, worktree: null, children: [] }] }, missingNode],
    };
    const sections = deriveRecentActivitySections({
      sessions: [root], getSessionLocation: (sessionId) => locations.get(sessionId) ?? null,
      getSessionNode: () => original, query: '',
    });
    const projected = sections[0].items[0].node;
    expect(projected.worktree).toBeNull();
    expect(resolveSessionPrLookup(projected.children[0].worktree))
      .toEqual({ directory: '/worktrees/feature', branch: 'feature' });
    expect(resolveSessionPrLookup(projected.children[0].children[0].worktree))
      .toEqual({ directory: '/worktrees/other', branch: 'other' });
    expect(projected.children[1]).toBe(missingNode);
    expect(projected.children.map((node) => node.session.sessionId)).toEqual(['child', 'missing']);
    expect(original.children[0].worktree).toBeNull();
  });
});

describe('sessionTreeMatchesSidebarQuery', () => {
  const tree = (): SessionNode => ({
    session: { ...session('ses_parent'), metadata: { title: 'Parent work' } },
    children: [{
      session: { ...session('ses_child', { parentSessionId: 'ses_parent' }), metadata: { title: 'Fix the header' } },
      children: [],
      worktree: null,
    }],
    worktree: null,
  });

  test('keeps a tree whose subsession is the match, by id and by title', () => {
    expect(sessionTreeMatchesSidebarQuery(tree(), 'ses_child')).toBe(true);
    expect(sessionTreeMatchesSidebarQuery(tree(), 'header')).toBe(true);
    expect(sessionTreeMatchesSidebarQuery(tree(), 'parent')).toBe(true);
  });

  test('drops a tree where nothing matches', () => {
    expect(sessionTreeMatchesSidebarQuery(tree(), 'unrelated')).toBe(false);
    expect(sessionTreeMatchesSidebarQuery(tree(), 'ses_other')).toBe(false);
  });
});
