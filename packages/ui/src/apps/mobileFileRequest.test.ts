import { describe, expect, test } from 'bun:test';

<<<<<<< HEAD
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
=======
import type { Session } from '@/lib/opencode/model';
import { fileNameOf, sessionLineage } from './mobileFileRequest';

const session = (id: string, fields: Partial<Session> = {}): Session => ({
  id,
  projectID: 'project',
  directory: '/repo',
  title: id,
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 1 },
  ...fields,
});
const reader = (sessions: Session[]) => async (id: string) => sessions.find((entry) => entry.id === id) ?? null;
const ids = (lineage: Session[]) => lineage.map((entry) => entry.id);

describe('sessionLineage', () => {
  test('walks from a subagent up to its root', async () => {
    const read = reader([session('grandchild', { parentID: 'child' }), session('child', { parentID: 'root' }), session('root')]);
    expect(ids(await sessionLineage('grandchild', read))).toEqual(['grandchild', 'child', 'root']);
  });

  test('a /btw side chat leads to the session it was typed into', async () => {
    const fork = session('fork', { metadata: { openchamber: { kind: 'btw', originalSessionID: 'root' } } });
    expect(ids(await sessionLineage('fork', reader([fork, session('root')])))).toEqual(['fork', 'root']);
  });

  test('a promoted side chat stands on its own', async () => {
    const promoted = session('fork', { metadata: { openchamber: { btwPromoted: true, originalSessionID: 'root' } } });
    expect(ids(await sessionLineage('fork', reader([promoted, session('root')])))).toEqual(['fork']);
  });

  test('stops at a session it cannot read', async () => {
    expect(ids(await sessionLineage('child', reader([session('child', { parentID: 'gone' })])))).toEqual(['child']);
    expect(await sessionLineage('gone', reader([]))).toEqual([]);
  });

  test('a link that loops ends the walk', async () => {
    const fork = session('fork', { metadata: { openchamber: { kind: 'btw', originalSessionID: 'fork' } } });
    expect(ids(await sessionLineage('fork', reader([fork])))).toEqual(['fork']);
    const read = reader([session('a', { parentID: 'b' }), session('b', { parentID: 'a' })]);
>>>>>>> bc50ba56a
    expect(ids(await sessionLineage('a', read))).toEqual(['a', 'b']);
  });
});

describe('fileNameOf', () => {
  test('takes the last part of POSIX and Windows paths', () => {
    expect(fileNameOf('/repo/out/report.md')).toBe('report.md');
    expect(fileNameOf('C:\\repo\\out\\report.md')).toBe('report.md');
  });
});
