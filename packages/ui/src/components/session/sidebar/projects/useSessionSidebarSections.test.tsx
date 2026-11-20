import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Session } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
import type { SessionGroup } from '../types';
import type { SessionFoldersMap } from '@/stores/useSessionFoldersStore';
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

const CHATS_ROOT = '/home/user/.config/ohpichamber/chats';

const chatSession = (sessionId: string, title: string, archivedAt?: number): Session => {
  const workspaceId = `ws_${sessionId}`;
  registerWorkspaceDirectory(workspaceId, `${CHATS_ROOT}/2026-08-28/session-${sessionId}`);
  return {
    sessionId,
    projectId: 'chats',
    workspaceId,
    displayPath: `${CHATS_ROOT}/2026-08-28/session-${sessionId}`,
    rootSessionId: sessionId,
    createdAt: 1,
    updatedAt: 1,
    epoch: '1',
    headSequence: '0',
    runtimeStatus: 'idle',
    activeRunId: null,
    mode: { kind: 'main' },
    metadata: null,
    metadataRevision: '0',
    archiveRevision: archivedAt === undefined ? '0' : '1',
    archivedAt,
    title,
  };
};

const chatsGroup = (sessions: Session[]): SessionGroup => ({
  id: 'managed-chats',
  label: '',
  branch: null,
  description: null,
  isMain: true,
  worktree: null,
  directory: CHATS_ROOT,
  folderScopeKey: CHATS_ROOT,
  folderScopes: [{ scopeKey: CHATS_ROOT, directory: CHATS_ROOT }],
  draftTarget: 'chat',
  sessions: sessions.map((session) => ({ session, children: [], worktree: null })),
});


// The real matcher and the real grouping callbacks run here: the reported bug
// was never about matching, so a stubbed matcher would test nothing.
const renderManagedChatSections = (
  group: SessionGroup,
  query: string,
  projectSessions?: Session[],
  foldersMap: SessionFoldersMap = { [CHATS_ROOT]: [{ id: 'folder', name: group.label, sessionIds: [], createdAt: 1 }] },
): Sections => {
  let captured: Sections | null = null;
  const Harness = () => {
    const sessionById = new Map((projectSessions ?? []).map((session) => [session.sessionId, session]));
    const grouping = useSessionGrouping({
      homeDirectory: '/home/user',
      worktreeMetadata: new Map(),
      pinnedSessionIds: new Set(),
      sessionOrderRanks: new Map(),
      gitBranches: new Map(),
      isVSCode: false,
      sessionById,
      childrenMap: new Map(),
      nestedSessionIds: new Set(),
    });
    captured = useSessionSidebarSections({
      normalizedProjects: projectSessions ? [{ id: 'project', path: CHATS_ROOT, normalizedPath: CHATS_ROOT }] : [],
      getSessionsForProject: () => projectSessions?.filter((session) => session.archivedAt === undefined) ?? [],
      getArchivedSessionsForProject: () => projectSessions?.filter((session) => session.archivedAt !== undefined) ?? [],
      availableWorktreesByProject: new Map(),
      projectRepoStatus: new Map(),
      projectRootBranches: new Map(),
      gitBranches: new Map(),
      sessionOrderRanks: new Map(),
      lastRepoStatus: false,
      buildGroupedSessions: grouping.buildGroupedSessions,
      getGroupingSessions: grouping.getGroupingSessions,
      hasSessionSearchQuery: query.length > 0,
      normalizedSessionSearchQuery: query,
      filterSessionNodesForSearch: grouping.filterSessionNodesForSearch,
      buildGroupSearchText: grouping.buildGroupSearchText,
      foldersMap,
      standaloneGroups: projectSessions ? [] : [group],
    });
    return null;
  };

  renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(Harness)));
  if (!captured) throw new Error('sections hook was not mounted');
  return captured;
};

// Issue #3200: the managed chats render outside every project section. They
// were left out of the search pass, and a group without search data renders
// `filteredNodes ?? []` — so every chat disappeared as soon as a query was
// typed, however well its title matched.
describe('sidebar search over standalone groups', () => {
  const targetId = 'ses_f88b1a2b3c4d';

  test('finds project sessions in flat results without searching their archived bucket', () => {
    const active = chatSession(targetId, 'Active');
    const archived = chatSession('ses_archived', 'Archived', 2);
    const group = chatsGroup([]);
    const sections = renderManagedChatSections(group, targetId, [active, archived]);
    expect(sections.flatSectionsForRender[0].groups[0].sessions.map((node) => node.session.sessionId)).toEqual([targetId]);
    expect(sections.searchMatchCount).toBe(1);
    const archivedSearch = renderManagedChatSections(group, archived.sessionId, [active, archived]);
    expect(archivedSearch.flatSectionsForRender).toEqual([]);
    expect(archivedSearch.searchMatchCount).toBe(0);
  });

  test('matches only a complete ID, ignoring case and surrounding whitespace', () => {
    const group = chatsGroup([
      chatSession(targetId, 'Release notes'),
      chatSession('ses_f88b1a2b3c4e', targetId),
    ]);
    group.label = targetId;
    for (const query of [targetId, `  ${targetId.toUpperCase()}\n`]) {
      const sections = renderManagedChatSections(group, query);
      const data = sections.groupSearchDataByGroup.get(group);
      expect(data?.filteredNodes.map((node) => node.session.sessionId)).toEqual([targetId]);
      expect(data?.groupMatches).toBe(false);
      expect(data?.folderNameMatchCount).toBe(0);
      expect(sections.searchMatchCount).toBe(1);
    }
    for (const query of ['ses_', 'ses_f88b', 'ses_f88b1a2b3c4f', `${targetId}x`, `${targetId} error`]) {
      expect(renderManagedChatSections(group, query).searchMatchCount).toBe(0);
    }
  });

  test('keeps tree context and counts only the ID match', () => {
    const group = chatsGroup([chatSession('ses_parent', 'Parent')]);
    const parent = group.sessions[0];
    parent.children = [
      { session: chatSession(targetId, 'Child'), children: [], worktree: null },
      { session: chatSession('ses_sibling', 'Sibling'), children: [], worktree: null },
    ];
    const sections = renderManagedChatSections(group, targetId);
    const nodes = sections.groupSearchDataByGroup.get(group)?.filteredNodes;
    expect(nodes?.map((node) => node.session.sessionId)).toEqual(['ses_parent']);
    expect(nodes?.[0].children.map((node) => node.session.sessionId)).toEqual([targetId]);
    expect(sections.searchMatchCount).toBe(1);
    const parentSections = renderManagedChatSections(group, 'ses_parent');
    expect(parentSections.groupSearchDataByGroup.get(group)?.filteredNodes[0]).toBe(parent);
    expect(parentSections.searchMatchCount).toBe(1);
    expect(parent.children).toHaveLength(2);
  });

  test('does not return archived sessions for an ID query', () => {
    const archived = chatSession(targetId, 'Archived', 2);
    const group = chatsGroup([archived]);
    expect(renderManagedChatSections(group, targetId).searchMatchCount).toBe(0);
  });

  test('keeps a matching chat in the group the sidebar renders', () => {
    const group = chatsGroup([
      chatSession('ses_a', 'Release notes for 1.21'),
      chatSession('ses_b', 'Unrelated grocery list'),
    ]);

    const sections = renderManagedChatSections(group, 'release');
    const data = sections.groupSearchDataByGroup.get(group);

    expect(data).toBeDefined();
    expect(data?.filteredNodes.map((node) => node.session.sessionId)).toEqual(['ses_a']);
    expect(data?.hasMatch).toBe(true);
  });

  test('counts chat matches in the header count', () => {
    const group = chatsGroup([
      chatSession('ses_a', 'Release notes for 1.21'),
      chatSession('ses_b', 'Release checklist'),
      chatSession('ses_c', 'Unrelated grocery list'),
    ]);

    expect(renderManagedChatSections(group, 'release').searchMatchCount).toBe(2);
  });

  test('searches folders from every managed Chats scope', () => {
    const group = chatsGroup([]);
    const alternateScope = `${CHATS_ROOT}/2026-08-28/session-a`;
    group.folderScopes = [
      { scopeKey: CHATS_ROOT, directory: CHATS_ROOT },
      { scopeKey: alternateScope, directory: alternateScope },
    ];
    const sections = renderManagedChatSections(group, 'alternate', undefined, {
      [CHATS_ROOT]: [],
      [alternateScope]: [{ id: 'alternate-folder', name: 'Alternate notes', sessionIds: [], createdAt: 1 }],
    });

    expect(sections.groupSearchDataByGroup.get(group)?.folderNameMatchCount).toBe(1);
    expect(sections.searchMatchCount).toBe(1);
  });

  test('reports no match for a chat group nothing matches in', () => {
    const group = chatsGroup([chatSession('ses_a', 'Release notes for 1.21')]);

    const sections = renderManagedChatSections(group, 'groceries');
    const data = sections.groupSearchDataByGroup.get(group);

    expect(data?.filteredNodes).toEqual([]);
    expect(data?.hasMatch).toBe(false);
    expect(sections.searchMatchCount).toBe(0);
  });

  test('skips the search pass entirely when no query is active', () => {
    const group = chatsGroup([chatSession('ses_a', 'Release notes for 1.21')]);

    const sections = renderManagedChatSections(group, '');

    expect(sections.groupSearchDataByGroup.has(group)).toBe(false);
    expect(sections.searchMatchCount).toBe(0);
  });
});
