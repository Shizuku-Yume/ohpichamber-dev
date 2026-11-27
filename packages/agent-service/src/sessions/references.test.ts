import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { PROMPT_RECEIPT_RETENTION_MS, SessionReferenceError, SessionReferences } from './references.ts';
import type { PromptReceipt } from '@openchamber/agent-contract';

const reference = (file: string) => ({ rootSessionId: 'sess_1', projectId: 'proj_1', workspaceId: 'ws_1', cwd: '/tmp/project', agentDirectory: '/tmp/project/.agent', sessionFile: file, displayPath: 'src/main.ts', createdAt: 1, updatedAt: 2 });

// Decision timestamps sit near the real clock: receipt expiry compares them
// with the service's live time, so epoch-1000 fixtures would be born expired.
const acceptedReceipt = (overrides: Partial<Extract<PromptReceipt, { outcome: 'accepted' }>> = {}): Extract<PromptReceipt, { outcome: 'accepted' }> => ({
  outcome: 'accepted', correlationId: 'corr_1', sessionId: 'sess_1', operation: 'send',
  runId: 'run_1', acceptedAt: Date.now(), expiresAt: Date.now() + PROMPT_RECEIPT_RETENTION_MS, ...overrides,
});
const rejectedReceipt = (overrides: Partial<Extract<PromptReceipt, { outcome: 'rejected' }>> = {}): Extract<PromptReceipt, { outcome: 'rejected' }> => ({
  outcome: 'rejected', correlationId: 'corr_1', sessionId: 'sess_1', operation: 'send',
  code: 'RUN_ACTIVE', detail: 'The session already has an active or continuation run',
  rejectedAt: Date.now(), expiresAt: Date.now() + PROMPT_RECEIPT_RETENTION_MS, ...overrides,
});

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

describe('SessionReferences prompt receipts', () => {
  test('a receipt survives close and reopen', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'receipt-roundtrip-'));
    try {
      const first = new SessionReferences(dir);
      await first.initialize();
      await first.put(reference('/tmp/session.jsonl'));
      await first.putReceipt(acceptedReceipt());
      await first.close();
      const second = new SessionReferences(dir);
      await second.initialize();
      expect(second.receipt('sess_1', 'corr_1')).toMatchObject({ outcome: 'accepted', runId: 'run_1' });
      expect(second.receipt('sess_1', 'never-written')).toBeNull();
      await second.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  test('a corrupt receipt row answers SESSION_RESTORE_FAILED instead of unknown, and valid rows survive', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'receipt-corrupt-'));
    const file = join(dir, 'session-references.json');
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(file, JSON.stringify({
        references: { sess_1: reference('/tmp/a.jsonl') },
        receipts: {
          'sess_1:corrupt': { outcome: 'accepted', correlationId: 'corrupt' },
          'sess_1:good': acceptedReceipt({ correlationId: 'good' }),
        },
      }));
      const store = new SessionReferences(dir);
      await store.initialize();
      expect(() => store.receipt('sess_1', 'corrupt')).toThrow(SessionReferenceError);
      expect(store.receipt('sess_1', 'good')?.outcome).toBe('accepted');
      // The corrupt row is quarantined in memory but stays in the persisted
      // document: corruption must not heal itself into a false `unknown`.
      // A receipt write in between must not prune the quarantined row out of
      // the document either: corruption survives every serialized persist.
      await store.putReceipt(acceptedReceipt({ correlationId: 'other', runId: 'run_other' }));
      await store.close();
      const reopened = new SessionReferences(dir);
      await reopened.initialize();
      expect(reopened.receipt('sess_1', 'good')?.outcome).toBe('accepted');
      expect(() => reopened.receipt('sess_1', 'corrupt')).toThrow(SessionReferenceError);
      await reopened.close();
      // A second restart answers the same failure: the row is never dropped.
      const third = new SessionReferences(dir);
      await third.initialize();
      expect(() => third.receipt('sess_1', 'corrupt')).toThrow(SessionReferenceError);
      await third.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  test('expired rows are swept at load and at write time through the injected clock', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'receipt-expiry-'));
    let now = 1_000;
    try {
      const first = new SessionReferences(dir, () => now);
      await first.initialize();
      await first.put(reference('/tmp/session.jsonl'));
      await first.putReceipt(acceptedReceipt({ correlationId: 'aged', acceptedAt: now, expiresAt: now + PROMPT_RECEIPT_RETENTION_MS }));
      now += PROMPT_RECEIPT_RETENTION_MS + 1;
      // Lazy sweep on write: the aged row leaves the document when the next
      // receipt is written, not on a timer.
      await first.putReceipt(acceptedReceipt({ correlationId: 'fresh', acceptedAt: now, expiresAt: now + PROMPT_RECEIPT_RETENTION_MS }));
      expect(first.receipt('sess_1', 'aged')).toBeNull();
      expect(first.receipt('sess_1', 'fresh')?.outcome).toBe('accepted');
      await first.close();
      const second = new SessionReferences(dir, () => now);
      await second.initialize();
      expect(second.receipt('sess_1', 'aged')).toBeNull();
      expect(second.receipt('sess_1', 'fresh')?.outcome).toBe('accepted');
      // Load-time sweep: once the fresh row ages out too, reopening drops it.
      now += PROMPT_RECEIPT_RETENTION_MS + 1;
      await second.close();
      const third = new SessionReferences(dir, () => now);
      await third.initialize();
      expect(third.receipt('sess_1', 'fresh')).toBeNull();
      await third.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  test('receipts are dropped when their owning session reference is removed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'receipt-deletion-'));
    try {
      const store = new SessionReferences(dir);
      await store.initialize();
      await store.put(reference('/tmp/session.jsonl'));
      await store.putReceipt(acceptedReceipt());
      await store.remove('sess_1');
      // The write path prunes by live session ids; the next receipt write for
      // any session settles the document, but the in-memory row must not
      // answer as a decision for a deleted session even before that.
      await store.put({ ...reference('/tmp/other.jsonl'), rootSessionId: 'sess_2' });
      await store.putReceipt(acceptedReceipt({ sessionId: 'sess_2', correlationId: 'corr_2' }));
      expect(store.receipt('sess_1', 'corr_1')).toBeNull();
      await store.close();
      const reopened = new SessionReferences(dir);
      await reopened.initialize();
      expect(reopened.receipt('sess_1', 'corr_1')).toBeNull();
      expect(reopened.receipt('sess_2', 'corr_2')?.outcome).toBe('accepted');
      await reopened.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  test('resubmission with the same correlation id returns the original decision unchanged', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'receipt-idempotent-'));
    try {
      const store = new SessionReferences(dir);
      await store.initialize();
      await store.put(reference('/tmp/session.jsonl'));
      const original = await store.putReceipt(acceptedReceipt({ runId: 'run_original', acceptedAt: 1_000 }));
      expect(original.runId).toBe('run_original');
      // A replayed write with a different decision payload must not overwrite
      // the row: the first durable decision is the one the client may already
      // have observed side effects from.
      const replayed = await store.putReceipt(acceptedReceipt({ runId: 'run_duplicate', acceptedAt: 9_999 }));
      expect(replayed.runId).toBe('run_original');
      expect(store.receipt('sess_1', 'corr_1')?.runId).toBe('run_original');
      // A rejected replay over an accepted row likewise keeps the original.
      const rejectedReplay = await store.putReceipt(rejectedReceipt());
      expect(rejectedReplay.outcome).toBe('accepted');
      await store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  test('a rejected row upgrades to accepted on a later admission, but accepted is never overwritten', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'receipt-upgrade-'));
    try {
      const store = new SessionReferences(dir);
      await store.initialize();
      await store.put(reference('/tmp/session.jsonl'));
      await store.putReceipt(rejectedReceipt());
      expect(store.receipt('sess_1', 'corr_1')).toMatchObject({ outcome: 'rejected' });
      // The recovered resubmission admits: the row must be able to move
      // rejected → accepted, or the retry would strand behind its own refusal.
      const upgraded = await store.putReceipt(acceptedReceipt({ runId: 'run_recovered' }));
      expect(upgraded).toMatchObject({ outcome: 'accepted', runId: 'run_recovered' });
      expect(store.receipt('sess_1', 'corr_1')).toMatchObject({ outcome: 'accepted', runId: 'run_recovered' });
      // Accepted is terminal: neither a second acceptance nor a rejection
      // rewrites the row a client may already have reconciled from.
      const replayedAccepted = await store.putReceipt(acceptedReceipt({ runId: 'run_other' }));
      expect(replayedAccepted.runId).toBe('run_recovered');
      const replayedRejected = await store.putReceipt(rejectedReceipt());
      expect(replayedRejected.outcome).toBe('accepted');
      await store.close();
      const reopened = new SessionReferences(dir);
      await reopened.initialize();
      expect(reopened.receipt('sess_1', 'corr_1')).toMatchObject({ outcome: 'accepted', runId: 'run_recovered' });
      await reopened.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  test('child-session receipts survive the pruning of a later receipt write', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'receipt-child-'));
    try {
      const store = new SessionReferences(dir);
      await store.initialize();
      await store.put(reference('/tmp/session.jsonl'));
      const child = {
        rootSessionId: 'sess_1', parentSessionId: 'sess_1', childSessionId: 'child_1', subagentId: 'sub_1',
        role: 'worker', status: 'running' as const, sessionFile: '/tmp/child.jsonl', projectId: 'proj_1', workspaceId: 'ws_1',
      };
      await store.putSubagent(child);
      await store.putReceipt(acceptedReceipt({ sessionId: 'child_1', correlationId: 'corr_child' }));
      await store.putReceipt(acceptedReceipt({ correlationId: 'corr_root' }));
      expect(store.receipt('child_1', 'corr_child')?.outcome).toBe('accepted');
      await store.close();
      const reopened = new SessionReferences(dir);
      await reopened.initialize();
      expect(reopened.receipt('child_1', 'corr_child')?.outcome).toBe('accepted');
      await reopened.removeSubagents('sess_1');
      await reopened.putReceipt(acceptedReceipt({ correlationId: 'corr_third' }));
      expect(reopened.receipt('child_1', 'corr_child')).toBeNull();
      await reopened.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  test('rekey moves receipts to the new session identity in the same write', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'receipt-rekey-'));
    try {
      const store = new SessionReferences(dir);
      await store.initialize();
      await store.put(reference('/tmp/session.jsonl'));
      await store.putReceipt(acceptedReceipt());
      await store.rekey('sess_1', { ...reference('/tmp/promoted.jsonl'), rootSessionId: 'promoted' });
      expect(store.receipt('sess_1', 'corr_1')).toBeNull();
      expect(store.receipt('promoted', 'corr_1')?.outcome).toBe('accepted');
      await store.close();
      const reopened = new SessionReferences(dir);
      await reopened.initialize();
      expect(reopened.receipt('promoted', 'corr_1')?.outcome).toBe('accepted');
      await reopened.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
