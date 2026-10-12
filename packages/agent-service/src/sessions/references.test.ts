import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { SessionReferenceError, SessionReferences } from './references.ts';

const reference = (file: string) => ({ rootSessionId: 'sess_1', projectId: 'proj_1', workspaceId: 'ws_1', cwd: '/tmp/project', agentDirectory: '/tmp/project/.agent', sessionFile: file, displayPath: 'src/main.ts', createdAt: 1, updatedAt: 2 });

describe('SessionReferences', () => {
  test('persists through close and reopen', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'session-references-'));
    try {
      const first = new SessionReferences(dir); await first.initialize(); await first.put(reference('/tmp/session.jsonl')); await first.close();
      const second = new SessionReferences(dir); await second.initialize(); expect(second.get('sess_1')?.sessionFile).toBe('/tmp/session.jsonl'); await second.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  test('failed atomic replacement keeps prior identity and file reference', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'session-reference-rollback-'));
    const file = join(dir, 'session-references.json');
    const store = new SessionReferences(dir);
    try {
      await store.initialize();
      await store.put(reference('/tmp/original.jsonl'));
      await rename(file, `${file}.previous`);
      await mkdir(file);
      await expect(store.put(reference('/tmp/replacement.jsonl'))).rejects.toMatchObject({ code: 'SESSION_RESTORE_FAILED' });
      expect(store.get('sess_1')?.sessionFile).toBe('/tmp/original.jsonl');
      await rm(file, { recursive: true });
      await rename(`${file}.previous`, file);
      const reopened = new SessionReferences(dir);
      await reopened.initialize();
      expect(reopened.get('sess_1')?.sessionFile).toBe('/tmp/original.jsonl');
      await reopened.close();
    } finally { await store.close(); await rm(dir, { recursive: true, force: true }); }
  });

  test('valid siblings survive malformed records and queued writes drain on close', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'session-reference-siblings-'));
    const file = join(dir, 'session-references.json');
    const store = new SessionReferences(dir);
    try {
      await writeFile(file, JSON.stringify({ references: { broken: { rootSessionId: 'broken' }, sess_1: reference('/tmp/a.jsonl') } }));
      await store.initialize();
      expect(store.list().errors).toEqual([{ sessionId: 'broken', code: 'SESSION_RESTORE_FAILED' }]);
      expect(() => store.get('broken')).toThrow(SessionReferenceError);
      const writes = [store.put(reference('/tmp/b.jsonl')), store.put({ ...reference('/tmp/c.jsonl'), rootSessionId: 'sess_2' })];
      await store.close();
      await Promise.all(writes);
      expect(() => store.put(reference('/tmp/after-close.jsonl'))).toThrow(SessionReferenceError);
      const reopened = new SessionReferences(dir);
      await reopened.initialize();
      expect(reopened.get('sess_1')?.sessionFile).toBe('/tmp/b.jsonl');
      expect(reopened.get('sess_2')?.sessionFile).toBe('/tmp/c.jsonl');
      expect(reopened.list().errors).toEqual([{ sessionId: 'broken', code: 'SESSION_RESTORE_FAILED' }]);
      await reopened.close();
    } finally { await store.close(); await rm(dir, { recursive: true, force: true }); }
  });
});
