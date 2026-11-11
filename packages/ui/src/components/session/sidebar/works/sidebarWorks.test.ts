import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
import type { SessionGroup, SessionNode } from '../types';
import type { ProjectSection } from '../projects/sessionProjectRender';
import { buildSessionRootIndex, buildSidebarWorkIndex, buildWorktreeArchiveAnchors, isGroupWork, orderInWorkWorks, orderSidebarWorks } from './sidebarWorks';
import { pickWorkSessionToOpen } from './workActions';

const session = (sessionId: string, extra: Partial<Session> = {}): Session => {
  registerWorkspaceDirectory('workspace-repo', '/repo');
  return {
    sessionId,
    projectId: 'project',
    workspaceId: 'workspace-repo',
    displayPath: '/repo',
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
    archiveRevision: '0',
    ...extra,
  };
};
const node = (id: string, children: SessionNode[] = [], extra: Partial<Session> = {}): SessionNode => ({ session: session(id, extra), children, worktree: null });
const group = (id: string, sessions: SessionNode[], worktree: boolean): SessionGroup => ({
  id, label: id, branch: worktree ? id : null, description: null, isMain: !worktree, directory: `/${id}`,
  worktree: worktree ? { path: `/${id}`, projectDirectory: '/repo', branch: id, label: id } : null,
  sessions,
});

const section: ProjectSection = {
  project: { id: 'p', normalizedPath: '/repo' },
  groups: [
    group('main', [node('root', [node('review')]), node('lonely')], false),
    group('wt', [node('w1'), node('w2')], true),
    group('empty-wt', [], true),
  ],
};

describe('sidebar works', () => {
  test('a root session with what nests under it is one work, a worktree with all its sessions another', () => {
    const index = buildSidebarWorkIndex([section]);
    expect(index.bySessionId.get('review')?.key).toBe('session:root');
    expect(index.bySessionId.get('w2')?.key).toBe('p:wt');
    expect(index.groupWorks.map((ref) => ref.key)).toEqual(['p:wt', 'p:empty-wt']);
  });

  test('an isolated space is one work with every session in it, like a worktree', () => {
    const space: SessionGroup = {
      id: 'space:abc', label: 'quick-falcon', branch: null, description: null, isMain: false, directory: '/spaces/abc/repo', worktree: null,
      space: { id: 'abc', name: 'quick-falcon', state: 'complete', projectDirectory: '/repo', directory: '/spaces/abc/repo' },
      sessions: [node('s1', [node('s1-review')]), node('s2')],
    };
    const archive: SessionGroup = { ...group('archived', [node('gone')], false), isMain: false, isArchivedBucket: true };
    expect(isGroupWork(space)).toBe(true);
    expect(isGroupWork(archive)).toBe(false);
    const index = buildSidebarWorkIndex([{ ...section, groups: [...section.groups, space, archive] }]);
    expect(index.bySessionId.get('s1-review')?.key).toBe('p:space:abc');
    expect(index.bySessionId.get('s2')?.key).toBe('p:space:abc');
    expect(index.groupWorks.map((ref) => ref.key)).toEqual(['p:wt', 'p:empty-wt', 'p:space:abc']);
  });

  test('works come once each, in the order of their first matching session', () => {
    const index = buildSidebarWorkIndex([section]);
    const order = ['w2', 'review', 'w1', 'lonely', 'root'].map((id) => session(id));
    expect(orderSidebarWorks(order, index, (entry) => entry.sessionId !== 'lonely').map((ref) => ref.key))
      .toEqual(['p:wt', 'session:root']);
  });

  describe('in work outside every added project', () => {
    const inWork: Partial<Session> = { metadata: { openchamber: { work: { state: 'open' } } } };
    const outside: Partial<Session> = { workspaceId: 'workspace-outside' };
    // `promoted` has no parentID but nests under `outside-root` by lineage (a
    // promoted /btw or a review), so its work is its root's.
    const promoted = node('promoted', [], { ...outside, ...inWork });
    const subagent = node('subagent', [], { ...outside, ...inWork, parentSessionId: 'outside-root', rootSessionId: 'outside-root' });
    const outsideRoot = node('outside-root', [promoted, subagent], outside);
    const childrenMap = new Map([['outside-root', [promoted.session, subagent.session]]]);
    const rootOf = buildSessionRootIndex([outsideRoot.session, session('root')], childrenMap);
    const notChat = () => false;

    test('every session maps to the top-level session it nests under', () => {
      expect(Object.fromEntries(rootOf)).toEqual({
        'outside-root': 'outside-root', promoted: 'outside-root', subagent: 'outside-root', root: 'root',
      });
    });

    test('a root in work without a registered project stays hidden', () => {
      const index = buildSidebarWorkIndex([section]);
      const tracked = session('tracked', { ...outside, ...inWork });
      const order = [session('w1', inWork), tracked, session('root', inWork)];
      const rootIndex = buildSessionRootIndex([tracked, session('root')], new Map());
      expect(orderInWorkWorks(order, index, rootIndex, notChat).map((ref) => ref.key))
        .toEqual(['p:wt', 'session:root']);
    });

    test('a nested session cannot admit a root without a registered project', () => {
      const index = buildSidebarWorkIndex([section]);
      const order = [promoted.session, subagent.session, outsideRoot.session];
      expect(orderInWorkWorks(order, index, rootOf, notChat).map((ref) => ({ key: ref.key, projectId: ref.projectId })))
        .toEqual([]);
    });

    test('archived sessions, chats and sessions not in work are left out', () => {
      const index = buildSidebarWorkIndex([section]);
      const archived = session('archived', { ...outside, ...inWork, archivedAt: 2 });
      const idle = session('idle', outside);
      registerWorkspaceDirectory('workspace-chat', '/home/.config/openchamber/chats/2026-10-26/session-1');
      const chat = session('chat', { ...inWork, workspaceId: 'workspace-chat' });
      const rootIndex = buildSessionRootIndex([archived, idle, chat], new Map());
      expect(orderInWorkWorks([archived, idle, chat], index, rootIndex, (directory) => directory?.includes('/chats/') ?? false))
        .toEqual([]);
    });
  });

  test('a worktree keeps the place its archived newest session gave it', () => {
    const index = buildSidebarWorkIndex([section]);
    // Listed newest first: lonely (30), w1 (20), root (10). The worktree's
    // newest session (25, archived) sat between lonely and w1.
    const values = new Map([['lonely', 30], ['archived', 25], ['w1', 20], ['root', 10], ['old', 5]]);
    const order = ['lonely', 'w1', 'root'].map((id) => session(id));
    const anchors = buildWorktreeArchiveAnchors({
      groupWorks: index.groupWorks,
      archivedSessions: [
        session('archived', { displayPath: '/wt' }),
        session('old', { displayPath: '/empty-wt' }),
        session('elsewhere', { displayPath: '/elsewhere' }),
      ],
      orderedSessions: order,
      orderValueOf: (entry) => values.get(entry.sessionId) ?? 0,
      isPinned: () => false,
    });
    expect([...anchors]).toEqual([['p:wt', 0.5], ['p:empty-wt', 2.5]]);
    expect(orderSidebarWorks(order, index, () => true, anchors).map((ref) => ref.key))
      .toEqual(['session:lonely', 'p:wt', 'session:root', 'p:empty-wt']);
  });

  test('a click opens the latest session that is not a review or fork, else the latest, else nothing', () => {
    const review = node('review', [], { metadata: { openchamber: { kind: 'review', originalSessionID: 'x' } } });
    const reviewMetadata = { metadata: { openchamber: { kind: 'review' as const, originalSessionID: 'x' } } };
    const fork = node('fork', [], { metadata: { openchamber: { ...reviewMetadata.metadata.openchamber, originalSessionID: 'x' } } });
    expect(pickWorkSessionToOpen([review, fork, node('work')])?.sessionId).toBe('work');
    expect(pickWorkSessionToOpen([review, fork])?.sessionId).toBe('review');
    expect(pickWorkSessionToOpen([])).toBeNull();
  });
});
