import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { resolveSessionNestingParentId } from './sessionWorkLineage';

const session = (sessionId: string, extra: Partial<Session> = {}): Session => ({
  sessionId,
  projectId: 'p1',
  workspaceId: 'w1',
  displayPath: '/repo',
  rootSessionId: sessionId,
  createdAt: 1,
  updatedAt: 1,
  epoch: '1',
  headSequence: '1',
  runtimeStatus: 'idle',
  activeRunId: null,
  mode: { kind: 'main' as const },
  metadataRevision: '0',
  archiveRevision: '0',
  metadata: null,
  ...extra,
});

const resolve = (target: Session, all: Session[]) => {
  const byId = new Map(all.map((entry) => [entry.sessionId, entry]));
  return resolveSessionNestingParentId(target, (id) => byId.get(id));
};

describe('resolveSessionNestingParentId', () => {
  const root = session('root');

  test('a subagent nests under its run, a review and a fork under their origin', () => {
    const subagent = session('sub', { parentSessionId: 'root' });
    const review = session('review', { metadata: { openchamber: { kind: 'review', originalSessionID: 'root' } }, metadataRevision: '1' });
    const fork = session('fork', { parentSessionId: 'root' });
    const all = [root, subagent, review, fork];
    expect(all.map((entry) => resolve(entry, all))).toEqual([null, 'root', 'root', 'root']);
  });

  test("a session another session's agent started stays a root", () => {
    const dispatched = session('dispatched', { metadata: { openchamber: { originSessionID: 'root' } } as unknown as Session['metadata'], metadataRevision: '1' });
    expect(resolve(dispatched, [root, dispatched])).toBeNull();
  });

  test('the folder wins: an origin in another folder, unknown or archived leaves a root', () => {
    const elsewhere = session('elsewhere', { displayPath: '/wt', metadata: { openchamber: { kind: 'review', originalSessionID: 'root' } } });
    const unknown = session('unknown', { metadata: { openchamber: { kind: 'review', originalSessionID: 'missing' } } });
    const archivedOrigin = session('old', { archivedAt: 2 });
    const fromArchived = session('child', { metadata: { openchamber: { kind: 'review', originalSessionID: 'old' } } });
    const all = [root, elsewhere, unknown, archivedOrigin, fromArchived];
    expect([elsewhere, unknown, fromArchived].map((entry) => resolve(entry, all))).toEqual([null, null, null]);
  });

  test('a multi-run lane stays a root, and a recorded loop does not nest', () => {
    const lane = session('lane', { parentSessionId: 'root', metadata: { openchamber: { multirun: { version: 1 } } } as unknown as Session['metadata'], metadataRevision: '1' });
    const a = session('a', { metadata: { openchamber: { kind: 'review', originalSessionID: 'b' } } });
    const b = session('b', { metadata: { openchamber: { kind: 'review', originalSessionID: 'a' } } });
    const all = [root, lane, a, b];
    expect(resolve(lane, all)).toBeNull();
    expect(resolve(a, all)).toBeNull();
    expect(resolve(b, all)).toBeNull();
  });
});
