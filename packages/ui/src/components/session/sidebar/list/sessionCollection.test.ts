import { ensureChatsRootDirectory } from '@/lib/chatDirectories';
import { hostFilesystem } from '@/lib/host-filesystem';
import { describe, expect, test } from 'bun:test';
import type { Session, SessionMetadata } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
import {
  buildActiveSessionNode,
  buildSidebarSessionProjection,
  getDescendantIds,
  partitionSidebarSessions,
  projectSidebarActiveSessions,
  projectSidebarCollection,
} from './sessionCollection';

const originalHomeInfo = hostFilesystem.getFilesystemHomeInfo;
hostFilesystem.getFilesystemHomeInfo = async () => ({
  home: '/home',
  canonicalChatsRoot: '/HOME/.config/ohpichamber/chats',
  canonicalLegacyChatsRoot: '/HOME/.config/ohpichamber/chats',
});
await ensureChatsRootDirectory();
hostFilesystem.getFilesystemHomeInfo = originalHomeInfo;

/**
 * A contract session in `directory`. The directory lives on the workspace, so
 * the fixture registers it the way bootstrap does, and the projection reads it
 * back through `resolveGlobalSessionDirectory`.
 */
const session = (
  sessionId: string,
  directory: string | null,
  overrides: Partial<Session> = {},
): Session => {
  const workspaceId = `ws_${sessionId}_${directory ?? ''}`;
  if (directory) registerWorkspaceDirectory(workspaceId, directory);
  return {
    sessionId,
    projectId: 'project_1',
    workspaceId,
    displayPath: directory ?? '.',
    parentSessionId: overrides.parentSessionId,
    rootSessionId: overrides.parentSessionId ?? sessionId,
    createdAt: 1,
    updatedAt: 1,
    epoch: 'epoch_1',
    headSequence: '0',
    runtimeStatus: 'idle',
    activeRunId: null,
    mode: { kind: 'main' },
    metadata: overrides.metadata ?? null,
    metadataRevision: overrides.metadata ? '1' : '0',
    archiveRevision: '0',
    ...overrides,
  };
};

/** A child of `parentSessionId` in the same directory. */
const childSession = (
  sessionId: string,
  directory: string | null,
  parentSessionId: string,
  overrides: Partial<Session> = {},
): Session => session(sessionId, directory, {
  parentSessionId,
  rootSessionId: parentSessionId,
  ...overrides,
});

/**
 * Metadata the server can write but the contract does not name yet: the
 * `/btw` and workflow-agent markers reach the fork's sidebar helpers only
 * through their own parsers, so the fixture hands them over unparsed.
 */
const withServerMetadata = (openchamber: Record<string, unknown>): Partial<Session> => ({
  // SAFETY: the fixture stands in for a server record the sidebar parses itself.
  metadata: { openchamber } as unknown as SessionMetadata,
  metadataRevision: '1',
});

describe('projectSidebarActiveSessions', () => {
  test('admits project descendants but not sibling prefixes or differently cased host paths', () => {
    expect(projectSidebarActiveSessions({
      globalActiveSessions: [session('child', '/Kept/subdir'), session('sibling', '/Kept-other'), session('case', '/kept')],
      liveSessions: [], knownDirectories: new Set(['/Kept']), isVSCode: false,
    }).map(entry => entry.sessionId)).toEqual(['child']);
  });

  test('keeps case-insensitive membership local to projection without rewriting request paths', () => {
    const knownDirectories = new Set(['/Users/Developer/Project']);
    const input = {
      globalActiveSessions: [session('known', '/users/developer/project'), session('unknown', '/other')],
      liveSessions: [],
      knownDirectories,
      isVSCode: true,
    };
    expect(projectSidebarActiveSessions(input).map((entry) => entry.sessionId)).toEqual(['known']);
    expect(buildSidebarSessionProjection({
      ...input,
      pinnedSessionIds: new Set(),
      sessionOrderRanks: new Map(),
    }).projectSessions.map((entry) => entry.sessionId)).toEqual(['known']);
    expect([...knownDirectories]).toEqual(['/Users/Developer/Project']);
  });

  test('keeps global precedence and order, then appends missing live sessions', () => {
    const global = [session('global-b', '/workspace/b'), session('global-a', '/workspace/a')];
    const live = [session('global-a', '/workspace/a'), session('live-c', '/workspace/c')];

    expect(projectSidebarActiveSessions({
      globalActiveSessions: global,
      liveSessions: live,
      knownDirectories: new Set(['/workspace/a', '/workspace/b', '/workspace/c']),
      isVSCode: false,
    }).map((entry) => entry.sessionId)).toEqual(['global-b', 'global-a', 'live-c']);
  });

  test('filters unknown VS Code directories', () => {
    const sessions = [session('known', '/workspace/known'), session('unknown', '/workspace/unknown')];

    expect(projectSidebarActiveSessions({
      globalActiveSessions: sessions,
      liveSessions: [],
      knownDirectories: new Set(['/workspace/known']),
      isVSCode: true,
    }).map((entry) => entry.sessionId)).toEqual(['known']);
  });

  test('hides missing or unknown directories for web when no projects are registered', () => {
    const sessions = [session('unknown', '/workspace/unknown'), session('empty', null)];

    expect(projectSidebarActiveSessions({
      globalActiveSessions: sessions,
      liveSessions: [],
      knownDirectories: new Set(),
      isVSCode: false,
    }).map((entry) => entry.sessionId)).toEqual([]);
  });

  test('hides unknown active full-app records without removing raw input records', () => {
    const restored = session('restored', '/deleted/worktrees/feature');

    expect(projectSidebarActiveSessions({
      globalActiveSessions: [restored],
      liveSessions: [],
      knownDirectories: new Set(['/workspace/known']),
      isVSCode: false,
    }).map((entry) => entry.sessionId)).toEqual([]);
    expect(restored.sessionId).toBe('restored');
  });

  test('keeps a subsession in an unknown folder under a parent it shows, and only there', () => {
    const parent = session('parent', '/workspace/known');
    const worker = { ...session('worker', '/removed/worktree'), parentID: 'parent' };
    const grandchild = { ...session('grandchild', '/removed/worktree'), parentID: 'worker' };
    const stray = { ...session('stray', '/removed/worktree'), parentID: 'unlisted' };
    const input = {
      globalActiveSessions: [parent, worker, grandchild, stray, session('root', '/removed/worktree')],
      liveSessions: [],
      knownDirectories: new Set(['/workspace/known']),
      isVSCode: false,
    };
    expect(projectSidebarActiveSessions(input).map((entry) => entry.id)).toEqual(['parent', 'worker', 'grandchild']);
    expect(buildSidebarSessionProjection({ ...input, pinnedSessionIds: new Set(), sessionOrderRanks: new Map() })
      .childrenMap.get('parent')?.map((entry) => entry.id)).toEqual(['worker']);
  });

  test('hides archived sessions in unregistered directories too', () => {
    const archived = session('archived', '/workspace/unknown', { archivedAt: 1 });

    expect(projectSidebarActiveSessions({
      globalActiveSessions: [archived],
      liveSessions: [],
      knownDirectories: new Set(['/workspace/known']),
      isVSCode: true,
    }).map((entry) => entry.sessionId)).toEqual([]);
  });

  test('does not replace a filtered global record with a live duplicate', () => {
    expect(projectSidebarActiveSessions({
      globalActiveSessions: [session('same', '/workspace/unknown')],
      liveSessions: [session('same', '/workspace/known')],
      knownDirectories: new Set(['/workspace/known']),
      isVSCode: true,
    })).toEqual([]);
  });
});

describe('projectSidebarCollection', () => {
  test('returns the same structural projection for unchanged inputs without module caching', () => {
    const globalActiveSessions = [session('a', '/workspace/a'), session('b', '/workspace/b')];
    const input = {
      globalActiveSessions,
      liveSessions: [],
      knownDirectories: new Set(['/workspace/a', '/workspace/b']),
      isVSCode: false,
    };

    const beforeSelection = projectSidebarCollection(input);
    const afterSelection = projectSidebarCollection(input);

    expect(afterSelection).toEqual(beforeSelection);
  });

  test('rebuilds when a structural session collection input changes', () => {
    const input = {
      globalActiveSessions: [session('a', '/workspace/a')],
      liveSessions: [],
      knownDirectories: new Set(['/workspace/a']),
      isVSCode: false,
    };

    const before = projectSidebarCollection(input);
    const after = projectSidebarCollection({
      ...input,
      globalActiveSessions: [session('a', '/workspace/a'), session('b', '/workspace/a')],
    });

    expect(after).not.toBe(before);
    expect(after.map((entry) => entry.sessionId)).toEqual(['a', 'b']);
  });

  test('keeps managed Chats in a dedicated projection and out of project ownership', () => {
    const managed = session('managed', '/home/.config/ohpichamber/chats/2026-08-24/session-managed');
    const project = session('project', '/workspace/a');
    const projects = projectSidebarCollection({
      globalActiveSessions: [managed, project],
      liveSessions: [],
      knownDirectories: new Set(['/workspace/a']),
      isVSCode: false,
    });

    expect(projects.map((entry) => entry.sessionId)).toEqual(['project']);
    expect(partitionSidebarSessions([managed, project], false).chatSessions.map((entry) => entry.sessionId)).toEqual(['managed']);
  });

  test("keeps a managed Chat's subsession in an unknown folder under that Chat", () => {
    const chat = session('chat', '/home/.config/openchamber/chats/2026-08-24/session-chat');
    const worker = { ...session('worker', '/removed/worktree'), parentID: 'chat' };
    const input = { globalActiveSessions: [chat, worker], liveSessions: [], knownDirectories: new Set(['/workspace/a']), isVSCode: false };
    expect(projectSidebarCollection(input).map((entry) => entry.id)).toEqual(['worker']);
    expect(buildSidebarSessionProjection({ ...input, pinnedSessionIds: new Set(), sessionOrderRanks: new Map() })
      .childrenMap.get('chat')?.map((entry) => entry.id)).toEqual(['worker']);
  });

  test('keeps managed Chats out of the VS Code sidebar', () => {
    const managed = session('managed', '/home/.config/ohpichamber/chats/2026-08-24/session-managed');

    expect(partitionSidebarSessions([managed], true)).toEqual({ projectSessions: [], chatSessions: [] });
    expect(projectSidebarCollection({
      globalActiveSessions: [managed],
      liveSessions: [],
      knownDirectories: new Set(),
      isVSCode: true,
    })).toEqual([]);
  });

  test('keeps a canonical managed chat visible when the server root uses different home casing', () => {
    const managed = session('canonical-chat', '/HOME/.config/ohpichamber/chats/day/session-a');
    const project = session('project', '/workspace/a');
    const projection = buildSidebarSessionProjection({
      globalActiveSessions: [managed, project], liveSessions: [],
      knownDirectories: new Set(['/workspace/a']), isVSCode: false,
      pinnedSessionIds: new Set(), sessionOrderRanks: new Map(),
    });
    expect(projection.chatSessions.map(entry => entry.sessionId)).toEqual(['canonical-chat']);
    expect(projection.projectSessions.map(entry => entry.sessionId)).toEqual(['project']);
    expect(projection.orderedSessions.map(entry => entry.sessionId)).toContain('canonical-chat');
  });

  test('keeps workflow agents in the hierarchy, where their requests count for the parent', () => {
    const parent = session('parent', '/workspace/a');
    const subagent = childSession('subagent', '/workspace/a', 'parent');
    const agent = childSession('workflow-agent', '/workspace/a', 'parent', withServerMetadata({ kind: 'workflow-agent' }));

    const projection = buildSidebarSessionProjection({
      globalActiveSessions: [parent, subagent, agent],
      liveSessions: [],
      knownDirectories: new Set(['/workspace/a']),
      isVSCode: false,
      pinnedSessionIds: new Set(),
      sessionOrderRanks: new Map(),
    });

    // Their rows are left out where rows are listed (`listedChildren`).
    expect(projection.childrenMap.get('parent')?.map((entry) => entry.sessionId).sort()).toEqual(['subagent', 'workflow-agent']);
  });

  test('keeps a ranked managed root and its active child in the Chats hierarchy', () => {
    const managedRoot = session('managed-root', '/home/.config/ohpichamber/chats/2026-08-24/session-root');
    const managedChild = childSession('managed-child', '/home/.config/ohpichamber/chats/2026-08-24/session-root', 'managed-root');
    const projectRoot = session('project-root', '/workspace/a');

    const projection = buildSidebarSessionProjection({
      globalActiveSessions: [projectRoot, managedRoot, managedChild],
      liveSessions: [],
      knownDirectories: new Set(['/workspace/a']),
      isVSCode: false,
      pinnedSessionIds: new Set(),
      sessionOrderRanks: new Map([['managed-root', 10]]),
    });

    expect(projection.projectSessions.map((entry) => entry.sessionId)).toEqual(['project-root']);
    expect(projection.chatSessions.map((entry) => entry.sessionId)).toEqual(['managed-root', 'managed-child']);
    expect(projection.orderedSessions.map((entry) => entry.sessionId)).toEqual(['managed-root', 'managed-child', 'project-root']);
    expect(projection.childrenMap.get('managed-root')?.map((entry) => entry.sessionId)).toEqual(['managed-child']);
  });
});

describe('getDescendantIds', () => {
  test('returns a depth-first subtree without exposing session entities', () => {
    const childA = session('child-a', '/workspace/a');
    const grandchild = childSession('grandchild', '/workspace/a', 'child-a');
    const childB = session('child-b', '/workspace/a');
    const childrenMap = new Map([
      ['root', [childA, childB]],
      ['child-a', [grandchild]],
    ]);

    expect(getDescendantIds(childrenMap, 'root'))
      .toEqual(['child-a', 'grandchild', 'child-b']);
  });

  test('cuts a parent cycle with deterministic unique descendants and excludes the root', () => {
    const childA = session('a', '/workspace/a');
    const childB = session('b', '/workspace/a');
    const childC = session('c', '/workspace/a');
    const childrenMap = new Map([
      ['root', [childA]],
      ['a', [childB, childC]],
      ['b', [childA]],
    ]);

    expect(getDescendantIds(childrenMap, 'root')).toEqual(['a', 'b', 'c']);
    expect(new Set(getDescendantIds(childrenMap, 'root')).size).toBe(3);
  });
});

describe('buildActiveSessionNode', () => {
  const archived = (id: string): Session => session(id, '/workspace', { archivedAt: 2 });

  test('nests every active descendant so archive reaches grandchildren', () => {
    const child = session('child', '/workspace');
    const grandchild = session('grandchild', '/workspace');
    const childrenMap = new Map([
      ['root', [child]],
      ['child', [grandchild]],
    ]);

    const node = buildActiveSessionNode(childrenMap, session('root', '/workspace'));

    expect(node.children.map((entry) => entry.session.sessionId)).toEqual(['child']);
    expect(node.children[0]?.children.map((entry) => entry.session.sessionId)).toEqual(['grandchild']);
    expect(node.worktree).toBeNull();
  });

  test('cuts archived children at every depth', () => {
    const activeChild = session('active-child', '/workspace');
    const archivedChild = archived('archived-child');
    const archivedGrandchild = archived('archived-grandchild');
    const childrenMap = new Map([
      ['root', [activeChild, archivedChild]],
      ['active-child', [archivedGrandchild]],
      ['archived-child', [session('hidden-leaf', '/workspace')]],
    ]);

    const node = buildActiveSessionNode(childrenMap, session('root', '/workspace'));

    expect(node.children.map((entry) => entry.session.sessionId)).toEqual(['active-child']);
    expect(node.children[0]?.children).toEqual([]);
  });

  test('stops on a parent cycle', () => {
    const a = session('a', '/workspace');
    const root = session('root', '/workspace');
    const childrenMap = new Map([
      ['root', [a]],
      ['a', [root]],
    ]);

    const node = buildActiveSessionNode(childrenMap, root);

    expect(node.children.map((entry) => entry.session.sessionId)).toEqual(['a']);
    expect(node.children[0]?.children).toEqual([]);
  });
});
