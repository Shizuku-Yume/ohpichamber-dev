import { describe, expect, test } from 'bun:test';
import type { CanonicalEvent } from '@openchamber/agent-contract';
import { applyDirectoryEvent, installSessionMetadata } from '../event-reducer';
import { INITIAL_STATE, type State } from '../types';
import { nativeSnapshot } from '../session-message-loader-test-fixtures';

const state = (): State => {
  const snapshot = nativeSnapshot();
  return {
    ...INITIAL_STATE,
    session: [{ ...snapshot.session, metadata: null, metadataRevision: '0', archiveRevision: '0' }],
    snapshot: { 'session-a': snapshot },
    message: { 'session-a': snapshot.messages },
    sessionEpoch: { 'session-a': 'epoch-a' },
    sessionCursor: { 'session-a': snapshot.cursor },
    permission: {}, form: {},
  };
};

describe('native session projection references', () => {
  test('a canonical title update leaves message and request maps untouched', () => {
    const before = state();
    const event: CanonicalEvent = {
      type: 'session.updated', sessionId: 'session-a', epoch: 'epoch-a', sequence: '5', timestamp: 3, title: 'Renamed',
    };
    const result = applyDirectoryEvent(before, event);
    expect(result.kind).toBe('applied');
    const after = result.state;
    expect(after.session).not.toBe(before.session);
    expect(after.session[0]?.title).toBe('Renamed');
    expect(after.message).toBe(before.message);
    expect(after.permission).toBe(before.permission);
    expect(after.form).toBe(before.form);
    expect(applyDirectoryEvent(after, event).state).toBe(after);
  });

  test('Host metadata changes preserve messages and reject an obsolete revision', () => {
    const before = state();
    const after = installSessionMetadata(before, { sessionId: 'session-a', revision: '2', metadata: { notes: 'Updated' } });
    expect(after.session).not.toBe(before.session);
    expect(after.session[0]?.metadata?.notes).toBe('Updated');
    expect(after.message).toBe(before.message);
    expect(after.permission).toBe(before.permission);
    expect(after.form).toBe(before.form);
    expect(installSessionMetadata(after, { sessionId: 'session-a', revision: '1', metadata: { notes: 'Old' } })).toBe(after);
  });
});
