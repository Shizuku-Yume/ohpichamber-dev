import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { Session, SessionMetadata } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { isSessionUnread, isSessionUnreadWithError, markSessionUnread, markSessionUnreadSeen, releaseKeptUnreadMarks } from './session-unread';

const session = (id: string, workbench?: { lastIdleAt?: number; viewedAt?: number; lastTurnOutcome?: 'completed' | 'failed' | 'cancelled' }, extra: Partial<Session> = {}): Session => ({
  sessionId: id,
  projectId: 'project',
  workspaceId: 'workspace',
  displayPath: id,
  rootSessionId: id,
  createdAt: 1,
  updatedAt: 1,
  epoch: '1',
  headSequence: '1',
  runtimeStatus: 'idle',
  activeRunId: null,
  mode: { kind: 'main' as const },
  metadataRevision: '1',
  archiveRevision: '0',
  metadata: (workbench ? { openchamber: { workbench } } : null) as unknown as SessionMetadata,
  ...extra,
});

const record = (id: string) => useGlobalSessionsStore.getState().entityById.get(id);

describe('isSessionUnread', () => {
  test('a finished turn nobody has seen is unread until a view reaches it', () => {
    expect(isSessionUnread(session('a'))).toBe(false);
    expect(isSessionUnread(session('a', { lastIdleAt: 10 }))).toBe(true);
    expect(isSessionUnread(session('a', { lastIdleAt: 10, viewedAt: 5 }))).toBe(true);
    expect(isSessionUnread(session('a', { lastIdleAt: 10, viewedAt: 10 }))).toBe(false);
    expect(isSessionUnread(undefined)).toBe(false);
  });

  test('subtasks and archived sessions are never unread', () => {
    expect(isSessionUnread(session('child', { lastIdleAt: 10 }, { parentSessionId: 'parent' }))).toBe(false);
    expect(isSessionUnread(session('a', { lastIdleAt: 10 }, { archivedAt: 20 }))).toBe(false);
  });

  test('an unread failed turn carries the error mark', () => {
    expect(isSessionUnreadWithError(session('a', { lastIdleAt: 10, lastTurnOutcome: 'failed' }))).toBe(true);
    expect(isSessionUnreadWithError(session('a', { lastIdleAt: 10, lastTurnOutcome: 'completed' }))).toBe(false);
    expect(isSessionUnreadWithError(session('a', { lastIdleAt: 10, viewedAt: 10, lastTurnOutcome: 'failed' }))).toBe(false);
  });
});

describe('markSessionUnreadSeen', () => {
  beforeEach(() => {
    switchRuntimeEndpoint({ apiBaseUrl: 'https://session-unread.test', runtimeKey: 'session-unread-test' });
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
    useGlobalSessionsStore.getState().applySnapshot([session('a', { lastIdleAt: 10, viewedAt: 5 })], [], 'ready');
  });

  afterEach(() => {
    mock.restore();
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  });

  test('clears the mark at once and patches metadata on the server', async () => {
    const patchSpy = spyOn(canonicalClient, 'patchSessionMetadata').mockResolvedValue({
      sessionId: 'a',
      revision: '2',
      metadata: { openchamber: { workbench: { lastIdleAt: 10, viewedAt: 10 } } } as unknown as SessionMetadata,
    });
    spyOn(canonicalClient, 'getSessionMetadata').mockResolvedValue({
      sessionId: 'a',
      revision: '1',
      metadata: { openchamber: { workbench: { lastIdleAt: 10, viewedAt: 5 } } } as unknown as SessionMetadata,
    });

    markSessionUnreadSeen('a');
    expect(isSessionUnread(record('a'))).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(patchSpy).toHaveBeenCalled();
  });

  test('a failed write brings the mark back', async () => {
    const { promise, reject } = Promise.withResolvers<never>();
    spyOn(canonicalClient, 'getSessionMetadata').mockResolvedValue({
      sessionId: 'a',
      revision: '1',
      metadata: { openchamber: { workbench: { lastIdleAt: 10, viewedAt: 5 } } } as unknown as SessionMetadata,
    });
    spyOn(canonicalClient, 'patchSessionMetadata').mockImplementation(() => promise);

    markSessionUnreadSeen('a');
    expect(isSessionUnread(record('a'))).toBe(false);
    reject(new Error('offline'));
    try {
      await promise;
    } catch {
      // expected rejection
    }
    await Promise.resolve();
    await Promise.resolve();
    expect(isSessionUnread(record('a'))).toBe(true);
  });

  test('a session that is already seen sends nothing', () => {
    const patchSpy = spyOn(canonicalClient, 'patchSessionMetadata');
    useGlobalSessionsStore.getState().upsertSession(session('a', { lastIdleAt: 10, viewedAt: 10 }));
    markSessionUnreadSeen('a');
    markSessionUnreadSeen('missing');
    expect(patchSpy).not.toHaveBeenCalled();
  });
});

describe('manual unread', () => {
  beforeEach(() => {
    switchRuntimeEndpoint({ apiBaseUrl: 'https://session-unread.test', runtimeKey: 'manual-unread' });
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
    useGlobalSessionsStore.getState().applySnapshot([session('a', { lastIdleAt: 10, viewedAt: 10 })], [], 'ready');
    releaseKeptUnreadMarks();
  });
  afterEach(() => { mock.restore(); releaseKeptUnreadMarks(); useGlobalSessionsStore.getState().resetForRuntimeSwitch(); });

  test('writes canonical metadata and keeps a manually marked session unread while viewed', async () => {
    spyOn(canonicalClient, 'getSessionMetadata').mockResolvedValue({ sessionId: 'a', revision: '1', metadata: { openchamber: { workbench: { lastIdleAt: 10, viewedAt: 10 } } } });
    const patch = spyOn(canonicalClient, 'patchSessionMetadata').mockResolvedValue({ sessionId: 'a', revision: '2', metadata: { openchamber: { workbench: { lastIdleAt: 10 } } } });
    const pending = markSessionUnread('a');
    expect(isSessionUnread(record('a'))).toBe(true);
    markSessionUnreadSeen('a');
    expect(isSessionUnread(record('a'))).toBe(true);
    expect(await pending).toBe(true);
    expect(patch.mock.calls[0]?.[1]).toEqual({ changes: { openchamber: { workbench: { viewedAt: null } } } });
    releaseKeptUnreadMarks();
    markSessionUnreadSeen('a');
    expect(isSessionUnread(record('a'))).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
  });

  test('empty, child and archived targets do not write', async () => {
    const patch = spyOn(canonicalClient, 'patchSessionMetadata');
    useGlobalSessionsStore.getState().upsertSession(session('child', undefined, { parentSessionId: 'a' }));
    useGlobalSessionsStore.getState().upsertSession(session('archived', undefined, { archivedAt: 3 }));
    for (const id of ['missing', 'child', 'archived']) expect(await markSessionUnread(id)).toBe(false);
    expect(patch).not.toHaveBeenCalled();
  });

  test('failed writes roll back only their own optimistic watermark', async () => {
    const gate = Promise.withResolvers<never>();
    spyOn(canonicalClient, 'getSessionMetadata').mockResolvedValue({ sessionId: 'a', revision: '1', metadata: { openchamber: { workbench: { lastIdleAt: 10, viewedAt: 10 } } } });
    spyOn(canonicalClient, 'patchSessionMetadata').mockImplementation(() => gate.promise);
    const pending = markSessionUnread('a');
    gate.reject(new Error('offline'));
    expect(await pending).toBe(false);
    expect(isSessionUnread(record('a'))).toBe(false);
  });

  test('an authoritative newer turn survives a failed manual write', async () => {
    const gate = Promise.withResolvers<never>();
    spyOn(canonicalClient, 'getSessionMetadata').mockResolvedValue({ sessionId: 'a', revision: '1', metadata: { openchamber: { workbench: { lastIdleAt: 10, viewedAt: 10 } } } });
    spyOn(canonicalClient, 'patchSessionMetadata').mockImplementation(() => gate.promise);
    const pending = markSessionUnread('a');
    useGlobalSessionsStore.getState().upsertSession(session('a', { lastIdleAt: 20 }));
    gate.reject(new Error('offline'));
    expect(await pending).toBe(false);
    expect(record('a')?.metadata?.openchamber?.workbench?.lastIdleAt).toBe(20);
    expect(isSessionUnread(record('a'))).toBe(true);
  });

  test('a metadata read with a newer turn does not rewind its idle watermark', async () => {
    spyOn(canonicalClient, 'getSessionMetadata').mockResolvedValue({ sessionId: 'a', revision: '2', metadata: { openchamber: { workbench: { lastIdleAt: 20, viewedAt: 10 } } } });
    const patch = spyOn(canonicalClient, 'patchSessionMetadata').mockResolvedValue({ sessionId: 'a', revision: '3', metadata: { openchamber: { workbench: { lastIdleAt: 20 } } } });
    expect(await markSessionUnread('a')).toBe(true);
    expect(patch.mock.calls[0]?.[1]).toEqual({ changes: { openchamber: { workbench: { viewedAt: null } } } });
  });
});
