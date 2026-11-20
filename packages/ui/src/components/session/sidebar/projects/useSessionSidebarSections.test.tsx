import { matchZoneSessionsForSidebarQuery } from '../recent/activitySections';
import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Session } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
import type { WorktreeMetadata } from '@/types/worktree';
import { I18nProvider } from '@/lib/i18n';
import { useSessionGrouping } from './useSessionGrouping';
import { useSessionSidebarSections } from './useSessionSidebarSections';

const ROOT = '/repo';
const WORKTREE = '/repo/.wt/topic';

const session = (sessionId: string, directory: string, archived = false): Session => {
  const workspaceId = 'workspace:' + directory;
  registerWorkspaceDirectory(workspaceId, directory);
  return {
    sessionId, projectId: 'project', workspaceId, rootSessionId: sessionId,
    displayPath: directory, title: sessionId, createdAt: 1, updatedAt: 1,
    epoch: '1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
    mode: { kind: 'main' }, metadata: null, metadataRevision: '0',
    archiveRevision: archived ? '1' : '0', archivedAt: archived ? 2 : undefined,
  };
};

type Sections = ReturnType<typeof useSessionSidebarSections>;

const renderSections = (sessions: Session[]): Sections => {
  let captured: Sections | null = null;
  const worktree: WorktreeMetadata = { source: 'sdk', name: 'topic', path: WORKTREE, projectDirectory: ROOT, branch: 'topic', label: 'topic' };
  const Harness = () => {
    const grouping = useSessionGrouping({
      homeDirectory: '/home/user',
      worktreeMetadata: new Map(),
      pinnedSessionIds: new Set(),
      sessionOrderRanks: new Map(),
      gitBranches: new Map(),
      isVSCode: false,
      sessionById: new Map(sessions.map((entry) => [entry.sessionId, entry])),
      childrenMap: new Map(),
      nestedSessionIds: new Set(),
    });
    captured = useSessionSidebarSections({
      normalizedProjects: [{ id: 'project', path: ROOT, normalizedPath: ROOT }],
      getSessionsForProject: () => sessions.filter((entry) => !entry.archivedAt),
      getArchivedSessionsForProject: () => sessions.filter((entry) => Boolean(entry.archivedAt)),
      availableWorktreesByProject: new Map([[ROOT, [worktree]]]),
      projectRepoStatus: new Map(),
      projectRootBranches: new Map(),
      gitBranches: new Map(),
      sessionOrderRanks: new Map(),
      lastRepoStatus: true,
      buildGroupedSessions: grouping.buildGroupedSessions,
      getGroupingSessions: grouping.getGroupingSessions,
    });
    return null;
  };

  renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(Harness)));
  if (!captured) throw new Error('sections hook was not mounted');
  return captured;
};

const idsByGroup = (sections: Sections['projectSections']) => sections[0]!.groups.map((group) => [group.id, group.sessions.map((node) => node.session.sessionId)]);

describe('useSessionSidebarSections', () => {
  const sessions = [session('root', ROOT), session('topic', WORKTREE), session('old', ROOT, true)];

  test('a project section groups its active sessions by worktree and keeps its archived ones in a bucket', () => {
    expect(idsByGroup(renderSections(sessions).projectSections)).toEqual([
      ['root', ['root']],
      [`worktree:${WORKTREE}`, ['topic']],
      ['archived', ['old']],
    ]);
  });

  test('the flat section merges the root and worktree groups and keeps the archived bucket apart', () => {
    const flat = renderSections(sessions).flatSectionsForRender;

    expect(idsByGroup(flat)).toEqual([['flat', ['root', 'topic']], ['archived', ['old']]]);
    expect(flat[0]!.groups[0]!.folderScopes).toEqual([{ scopeKey: ROOT, directory: ROOT }, { scopeKey: WORKTREE, directory: WORKTREE }]);
  });
});

describe('sidebar query projection', () => {
  const match = (sessions: Session[], query: string) => matchZoneSessionsForSidebarQuery(sessions.filter((entry) => !entry.archivedAt), (entry) => ({ session: entry, children: [], worktree: null }), query, 'session');
  const target = session('ses_target', ROOT);

  test('standalone sessions match a complete ID, ignoring case and surrounding whitespace', () => {
    const namedLikeId = { ...session('ses_other', ROOT), title: target.sessionId };
    for (const query of ['ses_target', '  SES_TARGET\n']) expect(match([target, namedLikeId], query).sessions).toEqual([target]);
    for (const query of ['ses_', 'ses_tar', 'ses_missing', 'ses_target error']) expect(match([target, namedLikeId], query).sessions).toEqual([]);
  });

  test('archived sessions stay out of the active tree projection', () => {
    expect(match([{ ...target, archivedAt: 2 }], 'ses_target').sessions).toEqual([]);
  });

  test('standalone title matches contribute to the count', () => {
    const entries = [{ ...target, title: 'Release notes' }, { ...session('ses_second', ROOT), title: 'Release checklist' }, { ...session('ses_other', ROOT), title: 'Groceries' }];
    const result = match(entries, 'release');
    expect(result.sessions.map((entry) => entry.sessionId)).toEqual(['ses_target', 'ses_second']);
    expect([...result.matchCountById.values()]).toEqual([1, 1]);
  });

  test('an unmatched query returns no rows or counts', () => {
    expect(match([target], 'groceries')).toEqual({ sessions: [], matchCountById: new Map() });
  });

  test('an empty query preserves all active standalone sessions', () => {
    expect(match([target], '').sessions).toEqual([target]);
    expect(match([target], '').matchCountById.size).toBe(0);
  });
});
