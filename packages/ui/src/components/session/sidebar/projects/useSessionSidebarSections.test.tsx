import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
<<<<<<< HEAD
import type { Session } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
||||||| bc50ba56aa
import type { Session } from '@/lib/opencode/model';
=======
import type { Session } from '@/lib/opencode/model';
import type { WorktreeMetadata } from '@/types/worktree';
>>>>>>> upstream/main
import { I18nProvider } from '@/lib/i18n';
import { useSessionGrouping } from './useSessionGrouping';
import { useSessionSidebarSections } from './useSessionSidebarSections';

<<<<<<< HEAD
const CHATS_ROOT = '/home/user/.config/ohpichamber/chats';
||||||| bc50ba56aa
const CHATS_ROOT = '/home/user/.config/openchamber/chats';
=======
const ROOT = '/repo';
const WORKTREE = '/repo/.wt/topic';
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
const chatSession = (id: string, title: string): Session => ({
  id,
  projectID: 'chats',
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  title,
  directory: `${CHATS_ROOT}/2026-08-28/session-${id}`,
  time: { created: 1, updated: 1 },
});

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
=======
const session = (id: string, directory: string, archived = false): Session => ({
  id,
  projectID: 'project',
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  title: id,
  directory,
  time: archived ? { created: 1, updated: 1, archived: 2 } : { created: 1, updated: 1 },
>>>>>>> upstream/main
});

type Sections = ReturnType<typeof useSessionSidebarSections>;

const renderSections = (sessions: Session[]): Sections => {
  let captured: Sections | null = null;
  const worktree: WorktreeMetadata = { source: 'sdk', name: 'topic', path: WORKTREE, projectDirectory: ROOT, branch: 'topic', label: 'topic' };
  const Harness = () => {
<<<<<<< HEAD
    const sessionById = new Map((projectSessions ?? []).map((session) => [session.sessionId, session]));
||||||| bc50ba56aa
    const sessionById = new Map((projectSessions ?? []).map((session) => [session.id, session]));
=======
>>>>>>> upstream/main
    const grouping = useSessionGrouping({
      homeDirectory: '/home/user',
      worktreeMetadata: new Map(),
      pinnedSessionIds: new Set(),
      sessionOrderRanks: new Map(),
      gitBranches: new Map(),
      isVSCode: false,
      sessionById: new Map(sessions.map((entry) => [entry.id, entry])),
      childrenMap: new Map(),
      nestedSessionIds: new Set(),
    });
    captured = useSessionSidebarSections({
<<<<<<< HEAD
      normalizedProjects: projectSessions ? [{ id: 'project', path: CHATS_ROOT, normalizedPath: CHATS_ROOT }] : [],
      getSessionsForProject: () => projectSessions?.filter((session) => session.archivedAt === undefined) ?? [],
      getArchivedSessionsForProject: () => projectSessions?.filter((session) => session.archivedAt !== undefined) ?? [],
      availableWorktreesByProject: new Map(),
||||||| bc50ba56aa
      normalizedProjects: projectSessions ? [{ id: 'project', path: CHATS_ROOT, normalizedPath: CHATS_ROOT }] : [],
      getSessionsForProject: () => projectSessions?.filter((session) => !session.time.archived) ?? [],
      getArchivedSessionsForProject: () => projectSessions?.filter((session) => Boolean(session.time.archived)) ?? [],
      availableWorktreesByProject: new Map(),
=======
      normalizedProjects: [{ id: 'project', path: ROOT, normalizedPath: ROOT }],
      getSessionsForProject: () => sessions.filter((entry) => !entry.time.archived),
      getArchivedSessionsForProject: () => sessions.filter((entry) => Boolean(entry.time.archived)),
      availableWorktreesByProject: new Map([[ROOT, [worktree]]]),
>>>>>>> upstream/main
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

const idsByGroup = (sections: Sections['projectSections']) => sections[0]!.groups.map((group) => [group.id, group.sessions.map((node) => node.session.id)]);

<<<<<<< HEAD
  test('finds project sessions in flat results without searching their archived bucket', () => {
    const active = chatSession(targetId, 'Active');
    const archived = chatSession('ses_archived', 'Archived', 2);
    const group = chatsGroup([]);
    const sections = renderSections(group, targetId, [active, archived]);
    expect(sections.flatSectionsForRender[0].groups[0].sessions.map((node) => node.session.sessionId)).toEqual([targetId]);
    expect(sections.searchMatchCount).toBe(1);
    const archivedSearch = renderSections(group, archived.sessionId, [active, archived]);
    expect(archivedSearch.flatSectionsForRender).toEqual([]);
    expect(archivedSearch.searchMatchCount).toBe(0);
  });
||||||| bc50ba56aa
  test('finds project sessions in flat results without searching their archived bucket', () => {
    const active = { ...chatSession(targetId, 'Active'), directory: CHATS_ROOT };
    const archived = { ...chatSession('ses_archived', 'Archived'), directory: CHATS_ROOT, time: { created: 1, updated: 1, archived: 2 } };
    const group = chatsGroup([]);
    const sections = renderSections(group, targetId, [active, archived]);
    expect(sections.flatSectionsForRender[0].groups[0].sessions.map((node) => node.session.id)).toEqual([targetId]);
    expect(sections.searchMatchCount).toBe(1);
    const archivedSearch = renderSections(group, archived.id, [active, archived]);
    expect(archivedSearch.flatSectionsForRender).toEqual([]);
    expect(archivedSearch.searchMatchCount).toBe(0);
  });
=======
describe('useSessionSidebarSections', () => {
  const sessions = [session('root', ROOT), session('topic', WORKTREE), session('old', ROOT, true)];
>>>>>>> upstream/main

  test('a project section groups its active sessions by worktree and keeps its archived ones in a bucket', () => {
    expect(idsByGroup(renderSections(sessions).projectSections)).toEqual([
      ['root', ['root']],
      [`worktree:${WORKTREE}`, ['topic']],
      ['archived', ['old']],
    ]);
<<<<<<< HEAD
    group.label = targetId;
    for (const query of [targetId, `  ${targetId.toUpperCase()}\n`]) {
      const sections = renderSections(group, query);
      const data = sections.groupSearchDataByGroup.get(group);
      expect(data?.filteredNodes.map((node) => node.session.sessionId)).toEqual([targetId]);
      expect(data?.groupMatches).toBe(false);
      expect(data?.folderNameMatchCount).toBe(0);
      expect(sections.searchMatchCount).toBe(1);
    }
    for (const query of ['ses_', 'ses_f88b', 'ses_f88b1a2b3c4f', `${targetId}x`, `${targetId} error`]) {
      expect(renderSections(group, query).searchMatchCount).toBe(0);
    }
||||||| bc50ba56aa
    group.label = targetId;
    for (const query of [targetId, `  ${targetId.toUpperCase()}\n`]) {
      const sections = renderSections(group, query);
      const data = sections.groupSearchDataByGroup.get(group);
      expect(data?.filteredNodes.map((node) => node.session.id)).toEqual([targetId]);
      expect(data?.groupMatches).toBe(false);
      expect(data?.folderNameMatchCount).toBe(0);
      expect(sections.searchMatchCount).toBe(1);
    }
    for (const query of ['ses_', 'ses_f88b', 'ses_f88b1a2b3c4f', `${targetId}x`, `${targetId} error`]) {
      expect(renderSections(group, query).searchMatchCount).toBe(0);
    }
=======
>>>>>>> upstream/main
  });

<<<<<<< HEAD
  test('keeps tree context and counts only the ID match', () => {
    const group = chatsGroup([chatSession('ses_parent', 'Parent')]);
    const parent = group.sessions[0];
    parent.children = [
      { session: chatSession(targetId, 'Child'), children: [], worktree: null },
      { session: chatSession('ses_sibling', 'Sibling'), children: [], worktree: null },
    ];
    const sections = renderSections(group, targetId);
    const nodes = sections.groupSearchDataByGroup.get(group)?.filteredNodes;
    expect(nodes?.map((node) => node.session.sessionId)).toEqual(['ses_parent']);
    expect(nodes?.[0].children.map((node) => node.session.sessionId)).toEqual([targetId]);
    expect(sections.searchMatchCount).toBe(1);
    const parentSections = renderSections(group, 'ses_parent');
    expect(parentSections.groupSearchDataByGroup.get(group)?.filteredNodes[0]).toBe(parent);
    expect(parentSections.searchMatchCount).toBe(1);
    expect(parent.children).toHaveLength(2);
  });
||||||| bc50ba56aa
  test('keeps tree context and counts only the ID match', () => {
    const group = chatsGroup([chatSession('ses_parent', 'Parent')]);
    const parent = group.sessions[0];
    parent.children = [
      { session: chatSession(targetId, 'Child'), children: [], worktree: null },
      { session: chatSession('ses_sibling', 'Sibling'), children: [], worktree: null },
    ];
    const sections = renderSections(group, targetId);
    const nodes = sections.groupSearchDataByGroup.get(group)?.filteredNodes;
    expect(nodes?.map((node) => node.session.id)).toEqual(['ses_parent']);
    expect(nodes?.[0].children.map((node) => node.session.id)).toEqual([targetId]);
    expect(sections.searchMatchCount).toBe(1);
    const parentSections = renderSections(group, 'ses_parent');
    expect(parentSections.groupSearchDataByGroup.get(group)?.filteredNodes[0]).toBe(parent);
    expect(parentSections.searchMatchCount).toBe(1);
    expect(parent.children).toHaveLength(2);
  });
=======
  test('the flat section merges the root and worktree groups and keeps the archived bucket apart', () => {
    const flat = renderSections(sessions).flatSectionsForRender;
>>>>>>> upstream/main

<<<<<<< HEAD
  test('does not return archived sessions for an ID query', () => {
    const archived = chatSession(targetId, 'Archived', 2);
    const group = chatsGroup([archived]);
    expect(renderSections(group, targetId).searchMatchCount).toBe(0);
  });

  test('keeps a matching chat in the group the sidebar renders', () => {
    const group = chatsGroup([
      chatSession('ses_a', 'Release notes for 1.21'),
      chatSession('ses_b', 'Unrelated grocery list'),
    ]);

    const sections = renderSections(group, 'release');
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

    expect(renderSections(group, 'release').searchMatchCount).toBe(2);
  });

  test('searches folders from every managed Chats scope', () => {
    const group = chatsGroup([]);
    const alternateScope = `${CHATS_ROOT}/2026-08-28/session-a`;
    group.folderScopes = [
      { scopeKey: CHATS_ROOT, directory: CHATS_ROOT },
      { scopeKey: alternateScope, directory: alternateScope },
    ];
    const sections = renderSections(group, 'alternate', undefined, {
      [CHATS_ROOT]: [],
      [alternateScope]: [{ id: 'alternate-folder', name: 'Alternate notes', sessionIds: [], createdAt: 1 }],
    });

    expect(sections.groupSearchDataByGroup.get(group)?.folderNameMatchCount).toBe(1);
    expect(sections.searchMatchCount).toBe(1);
  });

  test('reports no match for a chat group nothing matches in', () => {
    const group = chatsGroup([chatSession('ses_a', 'Release notes for 1.21')]);

    const sections = renderSections(group, 'groceries');
    const data = sections.groupSearchDataByGroup.get(group);

    expect(data?.filteredNodes).toEqual([]);
    expect(data?.hasMatch).toBe(false);
    expect(sections.searchMatchCount).toBe(0);
  });

  test('skips the search pass entirely when no query is active', () => {
    const group = chatsGroup([chatSession('ses_a', 'Release notes for 1.21')]);

    const sections = renderSections(group, '');

    expect(sections.groupSearchDataByGroup.has(group)).toBe(false);
    expect(sections.searchMatchCount).toBe(0);
||||||| bc50ba56aa
  test('does not return archived sessions for an ID query', () => {
    const archived = chatSession(targetId, 'Archived');
    archived.time.archived = 2;
    const group = chatsGroup([archived]);
    expect(renderSections(group, targetId).searchMatchCount).toBe(0);
  });

  test('keeps a matching chat in the group the sidebar renders', () => {
    const group = chatsGroup([
      chatSession('ses_a', 'Release notes for 1.21'),
      chatSession('ses_b', 'Unrelated grocery list'),
    ]);

    const sections = renderSections(group, 'release');
    const data = sections.groupSearchDataByGroup.get(group);

    expect(data).toBeDefined();
    expect(data?.filteredNodes.map((node) => node.session.id)).toEqual(['ses_a']);
    expect(data?.hasMatch).toBe(true);
  });

  test('counts chat matches in the header count', () => {
    const group = chatsGroup([
      chatSession('ses_a', 'Release notes for 1.21'),
      chatSession('ses_b', 'Release checklist'),
      chatSession('ses_c', 'Unrelated grocery list'),
    ]);

    expect(renderSections(group, 'release').searchMatchCount).toBe(2);
  });

  test('searches folders from every managed Chats scope', () => {
    const group = chatsGroup([]);
    const alternateScope = `${CHATS_ROOT}/2026-08-28/session-a`;
    group.folderScopes = [
      { scopeKey: CHATS_ROOT, directory: CHATS_ROOT },
      { scopeKey: alternateScope, directory: alternateScope },
    ];
    const sections = renderSections(group, 'alternate', undefined, {
      [CHATS_ROOT]: [],
      [alternateScope]: [{ id: 'alternate-folder', name: 'Alternate notes', sessionIds: [], createdAt: 1 }],
    });

    expect(sections.groupSearchDataByGroup.get(group)?.folderNameMatchCount).toBe(1);
    expect(sections.searchMatchCount).toBe(1);
  });

  test('reports no match for a chat group nothing matches in', () => {
    const group = chatsGroup([chatSession('ses_a', 'Release notes for 1.21')]);

    const sections = renderSections(group, 'groceries');
    const data = sections.groupSearchDataByGroup.get(group);

    expect(data?.filteredNodes).toEqual([]);
    expect(data?.hasMatch).toBe(false);
    expect(sections.searchMatchCount).toBe(0);
  });

  test('skips the search pass entirely when no query is active', () => {
    const group = chatsGroup([chatSession('ses_a', 'Release notes for 1.21')]);

    const sections = renderSections(group, '');

    expect(sections.groupSearchDataByGroup.has(group)).toBe(false);
    expect(sections.searchMatchCount).toBe(0);
=======
    expect(idsByGroup(flat)).toEqual([['flat', ['root', 'topic']], ['archived', ['old']]]);
    expect(flat[0]!.groups[0]!.folderScopes).toEqual([{ scopeKey: ROOT, directory: ROOT }, { scopeKey: WORKTREE, directory: WORKTREE }]);
>>>>>>> upstream/main
  });
});
