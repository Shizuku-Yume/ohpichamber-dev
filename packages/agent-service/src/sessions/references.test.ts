import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { SessionReferenceError, SessionReferences } from './references.ts';

const reference = (file: string) => ({ rootSessionId: 'sess_1', projectId: 'proj_1', workspaceId: 'ws_1', cwd: '/tmp/project', agentDirectory: '/tmp/project/.agent', sessionFile: file, displayPath: 'src/main.ts', createdAt: 1, updatedAt: 2 });

describe('SessionReferences', () => {
  test('rekey persists direct child parent links without changing nested links', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'session-reference-rekey-'));
    const store = new SessionReferences(dir);
    const reopened = new SessionReferences(dir);
    try {
      await store.initialize();
      await store.put(reference('/tmp/original.jsonl'));
      const child = {
        rootSessionId: 'sess_1', parentSessionId: 'sess_1', childSessionId: 'child', subagentId: 'sub_1',
        role: 'worker', status: 'completed' as const, sessionFile: '/tmp/child.jsonl', projectId: 'proj_1', workspaceId: 'ws_1',
      };
      await store.putSubagent(child);
      await store.putSubagent({ ...child, parentSessionId: 'child', childSessionId: 'grandchild', subagentId: 'sub_2' });
      await store.rekey('sess_1', { ...reference('/tmp/promoted.jsonl'), rootSessionId: 'promoted' });
      await store.close();
      await reopened.initialize();
      expect(reopened.listSubagents('sess_1')).toEqual([]);
      expect(reopened.listSubagents('promoted')).toMatchObject([
        { childSessionId: 'child', rootSessionId: 'promoted', parentSessionId: 'promoted' },
        { childSessionId: 'grandchild', rootSessionId: 'promoted', parentSessionId: 'child' },
      ]);
    } finally { await reopened.close(); await store.close(); await rm(dir, { recursive: true, force: true }); }
  });

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
