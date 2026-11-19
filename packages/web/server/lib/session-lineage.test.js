import { describe, expect, it } from 'vitest';
<<<<<<< HEAD

import { createSessionLineage } from './session-lineage.js';
||||||| bc50ba56aa
import { createSessionLineage } from './session-lineage.js';
=======
import { createSessionLineage, isOperatorChildSession, sessionParentId } from './session-lineage.js';
>>>>>>> upstream/main

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
  mode: { kind: 'main' },
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

<<<<<<< HEAD
    expect(lineage.isChild('session_a')).toBeUndefined();
    expect(lineage.isChild('session_b')).toBe(false);
    expect(lineage.isChild('session_c')).toBe(true);
||||||| bc50ba56aa
    expect(lineage.isChild('a')).toBeUndefined();
    expect(lineage.isChild('b')).toBe(true);
    expect(lineage.isChild('c')).toBe(false);
  });

  it('ignores unrelated events', () => {
    const lineage = createSessionLineage();
    lineage.observe({ type: 'session.status', properties: { sessionID: 'ses_1', status: { type: 'idle' } } });
    expect(lineage.isChild('ses_1')).toBeUndefined();
=======
    expect(lineage.isChild('a')).toBeUndefined();
    expect(lineage.isChild('b')).toBe(true);
    expect(lineage.isChild('c')).toBe(false);
  });

  it('forgets a linked child the user took over, and learns a link written later', () => {
    const lineage = createSessionLineage();
    const link = { openchamber: { kind: 'operator-child', parentID: 'ses_operator' } };
    expect(lineage.noteMetadata('ses_worker', link)).toBe(false);
    expect(lineage.isChild('ses_worker')).toBe(true);

    expect(lineage.noteMetadata('ses_worker', { openchamber: { work: { state: 'open' } } })).toBe(true);
    expect(lineage.isChild('ses_worker')).toBeUndefined();

    lineage.remember('ses_root', null);
    expect(lineage.noteMetadata('ses_root', {})).toBe(false);
    expect(lineage.isChild('ses_root')).toBe(false);
  });

  it('ignores unrelated events', () => {
    const lineage = createSessionLineage();
    lineage.observe({ type: 'session.status', properties: { sessionID: 'ses_1', status: { type: 'idle' } } });
    expect(lineage.isChild('ses_1')).toBeUndefined();
>>>>>>> upstream/main
  });
});

describe('sessionParentId', () => {
  const link = (parentID) => ({ openchamber: { kind: 'workflow-agent', parentID } });

  it("reads OpenCode's parent first, then a workflow agent's link to the session that ran it", () => {
    expect(sessionParentId({ id: 'ses_child', parentID: 'ses_parent' })).toBe('ses_parent');
    expect(sessionParentId({ id: 'ses_agent', metadata: link('ses_run') })).toBe('ses_run');
    expect(sessionParentId({ id: 'ses_agent', parentID: 'ses_parent', metadata: link('ses_run') })).toBe('ses_parent');
  });

  it("reads an operator's child session as a child of the session that created it", () => {
    const record = { id: 'ses_worker', metadata: { openchamber: { kind: 'operator-child', parentID: 'ses_operator' } } };
    expect(sessionParentId(record)).toBe('ses_operator');
    expect(isOperatorChildSession(record)).toBe(true);
    expect(isOperatorChildSession({ id: 'ses_agent', metadata: link('ses_run') })).toBe(false);
    expect(isOperatorChildSession(null)).toBe(false);
  });

  it('treats any other session as top-level', () => {
    for (const record of [null, {}, { id: 'ses_root' }, { id: 'ses_root', parentID: '' }, { metadata: { openchamber: { parentID: 'ses_x' } } }, { metadata: link('') }]) {
      expect(sessionParentId(record)).toBeNull();
    }
  });
});
