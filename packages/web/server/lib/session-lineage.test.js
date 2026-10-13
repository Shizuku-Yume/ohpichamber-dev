import { describe, expect, it } from 'vitest';

import { createSessionLineage } from './session-lineage.js';

const runtimeSession = (sessionId, rootSessionId = sessionId) => ({
  sessionId,
  projectId: 'project_1',
  workspaceId: 'workspace_1',
  displayPath: '.',
  rootSessionId,
  createdAt: 1,
  updatedAt: 2,
  epoch: 'epoch_1',
  headSequence: '0',
  runtimeStatus: 'idle',
  activeRunId: null,
});

const updated = (session) => ({
  type: 'session.updated',
  sessionId: session.sessionId,
  epoch: session.epoch,
  sequence: '1',
  timestamp: 3,
  session,
});

describe('session lineage', () => {
  it('learns child and independent-root relations from strict canonical session updates', () => {
    const lineage = createSessionLineage();

    lineage.observe(updated(runtimeSession('session_child', 'session_root')));
    lineage.observe(updated(runtimeSession('session_root')));

    expect(lineage.isChild('session_child')).toBe(true);
    expect(lineage.isChild('session_root')).toBe(false);
    expect(lineage.isChild('session_unknown')).toBeUndefined();
  });

  it('forgets every deleted canonical session and rejects legacy-shaped events', () => {
    const lineage = createSessionLineage();
    lineage.observe(updated(runtimeSession('session_child', 'session_root')));
    lineage.observe(updated(runtimeSession('session_root')));

    lineage.observe({
      type: 'session.deleted',
      sessionId: 'session_root',
      epoch: 'epoch_1',
      sequence: '2',
      timestamp: 4,
      deletedSessionIds: ['session_child', 'session_root'],
    });

    expect(lineage.isChild('session_child')).toBeUndefined();
    expect(lineage.isChild('session_root')).toBeUndefined();
    lineage.observe({ type: 'session.created', properties: { sessionID: 'legacy', info: { parentID: 'unknown' } } });
    expect(lineage.isChild('legacy')).toBeUndefined();
  });

  it('stays bounded while remembering canonical root identity', () => {
    const lineage = createSessionLineage({ limit: 2 });
    lineage.remember('session_a', 'session_root');
    lineage.remember('session_b', 'session_b');
    lineage.remember('session_c', 'session_root');

    expect(lineage.isChild('session_a')).toBeUndefined();
    expect(lineage.isChild('session_b')).toBe(false);
    expect(lineage.isChild('session_c')).toBe(true);
  });
});
