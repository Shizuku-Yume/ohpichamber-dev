import { describe, expect, test } from 'bun:test';

import { fileNameOf, sessionLineage, type SessionNode } from './mobileFileRequest';

type TestSession = SessionNode & {
  title?: string;
};

const session = (sessionId: string, parentSessionId?: string): TestSession => ({
  sessionId,
  parentSessionId,
  title: sessionId,
});

const reader = (sessions: TestSession[]) => async (id: string) =>
  sessions.find((entry) => entry.sessionId === id) ?? null;

const ids = (lineage: TestSession[]) => lineage.map((entry) => entry.sessionId);

describe('sessionLineage', () => {
  test('walks from a subagent up to its root via parentSessionId', async () => {
    const read = reader([
      session('grandchild', 'child'),
      session('child', 'root'),
      session('root'),
    ]);
    expect(ids(await sessionLineage('grandchild', read))).toEqual(['grandchild', 'child', 'root']);
  });

  test('stops at a session it cannot read', async () => {
    expect(ids(await sessionLineage('child', reader([session('child', 'gone')])))).toEqual(['child']);
    expect(await sessionLineage('gone', reader([]))).toEqual([]);
  });

  test('a cycle in parentSessionId ends the walk', async () => {
    const read = reader([session('a', 'b'), session('b', 'a')]);
    expect(ids(await sessionLineage('a', read))).toEqual(['a', 'b']);
  });
});

describe('fileNameOf', () => {
  test('takes the last part of POSIX and Windows paths', () => {
    expect(fileNameOf('/repo/out/report.md')).toBe('report.md');
    expect(fileNameOf('C:\\repo\\out\\report.md')).toBe('report.md');
  });
});
