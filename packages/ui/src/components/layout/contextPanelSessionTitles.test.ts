import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';

import { buildSubagentChildSessionRecord } from '@/stores/subagentSessionTitle';
import { areTitleMapsEqual, buildSessionTitleMap, EMPTY_SESSION_TITLE_MAP } from './contextPanelSessionTitles';

type SessionFixture = Partial<Pick<Session, 'sessionId' | 'title' | 'updatedAt'>>;

const state = (...sessions: SessionFixture[]) => ({
  session: sessions.map(({ sessionId = 'ses_a', title, updatedAt = 0 }, index) => ({
    sessionId,
    projectId: 'project_fixture',
    workspaceId: 'workspace_fixture',
    displayPath: '.',
    rootSessionId: sessionId,
    createdAt: 0,
    updatedAt,
    epoch: `epoch_${index}`,
    headSequence: '0',
    runtimeStatus: 'idle' as const,
    activeRunId: null,
    mode: { kind: 'main' as const },
    metadata: null,
    metadataRevision: '0',
    archiveRevision: '0',
    ...(title === undefined ? {} : { title }),
  })),
});

describe('context panel session titles', () => {
  test('reads a chat tab title from whichever live directory holds the session', () => {
    const titles = buildSessionTitleMap(
      [state({ sessionId: 'ses_a', title: 'Main chat' }), state({ sessionId: 'ses_b', title: 'Other project' })],
      ['ses_a', 'ses_b'],
    );

    expect(titles.get('ses_a')).toBe('Main chat');
    expect(titles.get('ses_b')).toBe('Other project');
  });

  test('follows a rename and leaves a session without a title to its fallback', () => {
    const states = [state({ sessionId: 'ses_a', title: 'Main chat' }), state({ sessionId: 'ses_b', title: '  ' }, { sessionId: 'ses_c', title: 'Not a tab' })];
    const before = buildSessionTitleMap(states, ['ses_a', 'ses_b']);
    const after = buildSessionTitleMap([states[0]!, state({ sessionId: 'ses_b', title: 'Renamed' })], ['ses_a', 'ses_b']);

    expect(before.has('ses_b')).toBe(false);
    expect(before.has('ses_c')).toBe(false);
    expect(after.get('ses_b')).toBe('Renamed');
    expect(areTitleMapsEqual(before, after)).toBe(false);
    expect(areTitleMapsEqual(before, buildSessionTitleMap(states, ['ses_a', 'ses_b']))).toBe(true);
  });

  test('prefers the most recently updated copy when a session sits in two stores', () => {
    const titles = buildSessionTitleMap(
      [state({ sessionId: 'ses_w', title: 'Stale copy', updatedAt: 1 }), state({ sessionId: 'ses_w', title: 'Fresh copy', updatedAt: 2 })],
      ['ses_w'],
    );
    const reversed = buildSessionTitleMap(
      [state({ sessionId: 'ses_w', title: 'Fresh copy', updatedAt: 2 }), state({ sessionId: 'ses_w', title: 'Stale copy', updatedAt: 1 })],
      ['ses_w'],
    );

    expect(titles.get('ses_w')).toBe('Fresh copy');
    expect(reversed.get('ses_w')).toBe('Fresh copy');
  });

  test('returns the shared empty map when nothing is wanted or found', () => {
    expect(buildSessionTitleMap([state({ sessionId: 'ses_a', title: 'Main chat' })], [])).toBe(EMPTY_SESSION_TITLE_MAP);
    expect(buildSessionTitleMap([state({ sessionId: 'ses_a', title: 'Main chat' })], ['ses_missing'])).toBe(EMPTY_SESSION_TITLE_MAP);
  });

  test('resolves post-reload child session titles from globalSessionsById when live directory stores lack the child', () => {
    const parent: Session = {
      sessionId: 'parent-1',
      projectId: 'project_fixture',
      workspaceId: 'workspace_fixture',
      displayPath: '.',
      rootSessionId: 'parent-1',
      createdAt: 1,
      updatedAt: 10,
      epoch: 'epoch_1',
      headSequence: '1',
      runtimeStatus: 'idle',
      activeRunId: null,
      mode: { kind: 'main' },
      metadata: null,
      metadataRevision: '0',
      archiveRevision: '0',
    };
    const childRecord = buildSubagentChildSessionRecord(parent, {
      subagentId: 'home-disk-usage-2',
      parentSessionId: 'parent-1',
      childSessionId: 'vibe-child-2',
      name: 'home-disk-usage-2',
      role: 'sonic',
      status: 'completed',
      updatedAt: 20,
    });
    const globalById = new Map<string, Session>([[childRecord.sessionId, childRecord]]);

    // Empty live directory store (e.g. immediately after page reload) or title-less child snapshot
    const fromEmptyLive = buildSessionTitleMap([], ['vibe-child-2'], globalById);
    expect(fromEmptyLive.get('vibe-child-2')).toBe('home-disk-usage-2');

    const fromTitlelessLive = buildSessionTitleMap([state({ sessionId: 'vibe-child-2', updatedAt: 20 })], ['vibe-child-2'], globalById);
    expect(fromTitlelessLive.get('vibe-child-2')).toBe('home-disk-usage-2');

    // Live directory store renames at equal updatedAt still take precedence over global cache
    const liveRenamed = buildSessionTitleMap(
      [state({ sessionId: 'vibe-child-2', title: 'Live renamed', updatedAt: 20 })],
      ['vibe-child-2'],
      globalById,
    );
    expect(liveRenamed.get('vibe-child-2')).toBe('Live renamed');
  });
});
