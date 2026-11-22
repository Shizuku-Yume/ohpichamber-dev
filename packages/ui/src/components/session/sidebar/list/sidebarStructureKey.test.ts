import { describe, expect, test } from 'bun:test';

import type { Session } from '@openchamber/agent-contract';
import { haveSameSidebarHierarchy, haveSameSidebarStructure } from './sidebarStructureKey';

const session = (overrides: Partial<Session> = {}): Session => ({
  sessionId: 'ses_a', projectId: 'project', workspaceId: 'workspace', displayPath: '/repo', rootSessionId: 'ses_a', createdAt: 1, updatedAt: 2, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' }, title: 'Parser fix', metadataRevision: '1', archiveRevision: '0',
  metadata: { openchamber: { work: { state: 'open', openedAt: 1, openedBy: 'jev' } } }, ...overrides,
});

const same = (before: Session, after: Session, withActivityTime = false) => (
  haveSameSidebarStructure([before], [after], withActivityTime)
);

describe('haveSameSidebarStructure', () => {
  test('a finished turn changes only what a row shows', () => {
    const before = session();
    const after = session({ updatedAt: 9, headSequence: '90', epoch: 'other', activeRunId: 'run', runtimeStatus: 'running', metadataRevision: '2', metadata: { openchamber: { work: { state: 'open', openedAt: 1, openedBy: 'jev' }, turn: { endedAt: 9, durationMs: 8 } } } });
    expect(same(before, after)).toBe(true);

    const bare = session({ metadata: null });
    expect(same(bare, session({ metadata: { openchamber: { turn: { endedAt: 9, durationMs: 8 } } } }))).toBe(true);
    expect(same(session({ metadata: { openchamber: {} } }), session({ metadata: { openchamber: { turn: { endedAt: 9, durationMs: 8 } } } }))).toBe(true);
    const work = { state: 'open' as const, openedAt: 1 };
    expect(same(
      session({ metadata: { openchamber: { work }, notes: 'keep' } }),
      session({ metadata: { openchamber: { work, turn: { endedAt: 9, durationMs: 8 } }, notes: 'keep' } }),
    )).toBe(true);
  });

  test('membership, nesting, title, archive, work and pins change the structure', () => {
    const before = session();
    expect(same(before, session({ title: 'Renamed' }))).toBe(false);
    expect(same(before, session({ parentSessionId: 'ses_parent' }))).toBe(false);
    expect(same(before, session({ displayPath: '/repo/worktree' }))).toBe(false);
    expect(same(before, session({ archivedAt: 3 }))).toBe(false);
    expect(same(before, session({ metadata: { openchamber: { work: { state: 'done', doneAt: 3 } } } }))).toBe(false);
    expect(same(before, session({ metadata: { openchamber: { work: { state: 'open' }, pinned: { at: 3 } } } }))).toBe(false);
    expect(haveSameSidebarStructure([before], [before, session({ sessionId: 'ses_b' })], false)).toBe(false);
    expect(haveSameSidebarStructure([before, session({ sessionId: 'ses_b' })], [session({ sessionId: 'ses_b' }), before], false)).toBe(false);
  });

  test('the last activity time counts only where the sidebar reads it', () => {
    const before = session();
    const after = session({ updatedAt: 9 });
    expect(same(before, after, false)).toBe(true);
    expect(same(before, after, true)).toBe(false);
  });

  test('a turn ending after a done suggestion takes the suggestion back', () => {
    const suggested = { openchamber: { work: { state: 'open' as const, suggestDoneAt: 5 } } };
    const before = session({ updatedAt: 4, metadata: { openchamber: { ...suggested.openchamber, turn: { endedAt: 4, durationMs: 0 } } } });
    expect(same(before, session({ updatedAt: 4, metadata: { openchamber: { ...suggested.openchamber, turn: { endedAt: 4, durationMs: 0 } } } }))).toBe(true);
    expect(same(before, session({ updatedAt: 9, metadata: { openchamber: { ...suggested.openchamber, turn: { endedAt: 9, durationMs: 0 } } } }))).toBe(false);
  });
});

describe('haveSameSidebarHierarchy', () => {
  const hierarchy = (rootIds: string[], children: Array<[string, string[]]>) => ({
    activeSessionIds: [], activeRootIds: rootIds, activeChildrenByParentId: new Map(children), activeIdsByDirectory: new Map(),
  });

  test('a rebuilt hierarchy with the same nesting counts as the same', () => {
    expect(haveSameSidebarHierarchy(hierarchy(['a', 'b'], [['a', ['c']]]), hierarchy(['a', 'b'], [['a', ['c']]]))).toBe(true);
  });

  test('a moved, added or reordered session counts as a change', () => {
    const before = hierarchy(['a', 'b'], [['a', ['c']]]);
    expect(haveSameSidebarHierarchy(before, hierarchy(['a', 'b'], [['b', ['c']]]))).toBe(false);
    expect(haveSameSidebarHierarchy(before, hierarchy(['a', 'b', 'd'], [['a', ['c']]]))).toBe(false);
    expect(haveSameSidebarHierarchy(before, hierarchy(['b', 'a'], [['a', ['c']]]))).toBe(false);
    expect(haveSameSidebarHierarchy(before, hierarchy(['a', 'b'], [['a', ['c', 'e']]]))).toBe(false);
  });
});
