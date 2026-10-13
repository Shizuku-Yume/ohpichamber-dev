import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createPromptQueueStore } from './sqlite-store.js';

const roots = [];
const stores = [];
const directory = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpi-queue-')); roots.push(root); return root; };
const open = (options) => { const store = createPromptQueueStore(options); stores.push(store); return store; };
const scope = { sessionId: 'session-one', projectId: 'project-one', workspaceId: 'workspace-one' };
const options = { providerId: 'provider', modelId: 'model', agentId: 'agent', variant: 'variant', reasoningEffort: 'high' };
const request = (text) => ({ input: { text, attachments: [{ attachmentId: 'upload-one', name: 'file.txt', mediaType: 'text/plain', size: 3, uri: 'attachment://upload-one' }], context: [{ kind: 'context', text: 'captured diff', metadata: { issue: 5 }, instructions: 'review first', deliveryReceiptId: 'knowledge-one' }, { kind: 'synthetic', text: 'second context' }], agentMention: { agentId: 'reviewer' } }, options });
const append = (store, revision, text, command = randomUUID()) => store.append(scope, command, { expectedRevision: revision, content: text, request: request(text) });
afterEach(async () => { for (const store of stores.splice(0)) await store.close(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

test('queue command replay, captured delivery and head exclusion survive Host restart', async () => {
  const dataDir = directory(); let clock = 1000;
  let store = open({ dataDir, now: () => clock }); const command = randomUUID();
  const first = await append(store, '0', 'first', command);
  const second = await append(store, '1', 'second');
  assert.deepEqual(await append(store, '0', 'first', command), first);
  await assert.rejects(append(store, '0', 'changed', command), { code: 'IDEMPOTENCY_CONFLICT' });
  await assert.rejects(append(store, '0', 'stale'), { code: 'QUEUE_CONFLICT' });
  const claim = await store.claimHead(scope, '2', { epoch: 'epoch-one', expiresAt: 2000 });
  assert.deepEqual(claim.capture.request, request('first'));
  assert.equal(claim.queue.items[0].context[0].text, undefined);
  assert.equal((await store.claimHead(scope, '3', { epoch: 'epoch-one', expiresAt: 2000 })).capture, null);
  await assert.rejects(store.remove(scope, { expectedRevision: '3', queueItemId: first.items[0].queueItemId }), { code: 'QUEUE_CONFLICT' });
  await assert.rejects(store.reorder(scope, { expectedRevision: '3', queueItemIds: second.items.map((item) => item.queueItemId).reverse() }), { code: 'QUEUE_CONFLICT' });
  await store.markSubmitting(scope, claim.capture.leaseId);
  await store.close(); clock = 3000; store = open({ dataDir, now: () => clock });
  assert.equal((await store.recoverUnsentClaims(scope)).items[0].status, 'leased');
  assert.deepEqual((await store.pendingDeliveries(scope))[0], { leaseId: claim.capture.leaseId, queueItemId: claim.capture.queueItemId, runId: claim.capture.runId, epoch: 'epoch-one', phase: 'submitting' });
  const acknowledged = await store.acknowledge(scope, claim.capture.leaseId);
  assert.equal(acknowledged.revision, '4'); assert.equal(acknowledged.items[0].text, 'second');
  assert.deepEqual(await store.acknowledge(scope, claim.capture.leaseId), acknowledged);
  const next = await store.claimHead(scope, '4', { epoch: 'epoch-two', expiresAt: 4000 });
  assert.deepEqual(next.capture.request, request('second'));
  await assert.rejects(store.getState({ ...scope, workspaceId: 'wrong-workspace' }), { code: 'SESSION_NOT_FOUND' });
});

test('only expired unsent claims recover; retry and terminal failure are atomic', async () => {
  let clock = 100; const store = open({ dataDir: directory(), now: () => clock });
  await append(store, '0', 'first'); await append(store, '1', 'second');
  let claim = await store.claimHead(scope, '2', { epoch: 'epoch-one', expiresAt: 200 });
  clock = 300;
  const recovered = await store.recoverUnsentClaims(scope);
  assert.equal(recovered.revision, '4'); assert.equal(recovered.items[0].status, 'queued');
  claim = await store.claimHead(scope, '4', { epoch: 'epoch-one', expiresAt: 400 });
  const retried = await store.retry(scope, claim.capture.leaseId, 'SERVICE_UNAVAILABLE');
  assert.equal(retried.revision, '6'); assert.equal(retried.items[0].text, 'first');
  claim = await store.claimHead(scope, '6', { epoch: 'epoch-one', expiresAt: 400 });
  const failed = await store.fail(scope, claim.capture.leaseId, 'INVALID_REQUEST');
  assert.equal(failed.revision, '8'); assert.deepEqual(failed.items.map((item) => item.text), ['second']);
  assert.deepEqual(await store.fail(scope, claim.capture.leaseId, 'INVALID_REQUEST'), failed);
});

test('malformed owner and failed disk writes cannot erase valid sibling queues', async () => {
  const dataDir = directory(); const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
  const store = open({ dataDir, database: db, closeDatabase: true });
  const first = await append(store, '0', 'valid');
  const sibling = { ...scope, sessionId: 'session-two' };
  await store.append(sibling, randomUUID(), { expectedRevision: '0', content: 'second', request: request('second') });
  db.prepare('UPDATE prompt_queue_item SET payload = ? WHERE session_id = ?').run('{malformed', sibling.sessionId);
  const listed = await store.list();
  assert.deepEqual(listed.items, [{ scope, queue: first }]);
  assert.deepEqual(listed.errors, [{ sessionId: sibling.sessionId, code: 'INTERNAL_ERROR', storage: 'corrupt' }]);
  await assert.rejects(store.getState(sibling), { code: 'INTERNAL_ERROR', details: { storage: 'corrupt' } });
  db.exec('PRAGMA query_only = ON');
  await assert.rejects(append(store, '1', 'not committed'), { code: 'INTERNAL_ERROR', details: { storage: 'write_failed' } });
  assert.deepEqual(await store.getState(scope), first);
});

test('one-time JSON conversion preserves attachments, revision and good siblings without resurrection', async () => {
  const dataDir = directory(); const sourcePath = path.join(dataDir, 'message-queue.json');
  const legacy = { version: 1, revision: 91, sessions: {
    old: { directory: '/authorized/project', items: [{ id: 'old-item', createdAt: 50, content: 'original', text: 'resolved text', attachments: [{ id: 'old-upload', filename: 'file.txt', mimeType: 'text/plain', size: 3, source: 'local', dataUrl: 'data:text/plain;base64,YWJj' }], context: request('x').input.context, sendConfig: { providerID: 'provider', modelID: 'model', agent: 'agent', variant: 'variant' } }] },
    broken: { directory: '/authorized/other', items: ['malformed'] },
  } };
  const source = JSON.stringify(legacy); fs.writeFileSync(sourcePath, source);
  let store = open({ dataDir }); let imports = 0;
  const conversion = { resolveScope: async (sourceId) => sourceId === 'old' ? scope : { ...scope, sessionId: 'broken' }, importAttachment: async (_scope, attachment) => { imports++; assert.equal(attachment.dataUrl, 'data:text/plain;base64,YWJj'); return request('x').input.attachments[0]; }, resolveScheduledTask: async () => { throw new Error('unexpected scheduled task'); } };
  const result = await store.convertLegacy(conversion);
  assert.equal(result.status, 'partial'); assert.deepEqual(result.errors.map((error) => error.sourceId), ['broken']);
  await assert.rejects(store.getState({ ...scope, sessionId: 'broken' }), { code: 'INTERNAL_ERROR', details: { storage: 'conversion_failed' } });
  const projected = await store.getState(scope);
  assert.equal(projected.revision, '91'); assert.equal(projected.items[0].text, 'resolved text'); assert.equal(projected.items[0].attachments[0].uri, 'attachment://upload-one');
  await store.remove(scope, { expectedRevision: '91', queueItemId: 'old-item' });
  await store.close(); store = open({ dataDir }); await store.convertLegacy(conversion);
  assert.equal(imports, 1); assert.equal((await store.getState(scope)).revision, '92'); assert.deepEqual((await store.getState(scope)).items, []);
  assert.equal(fs.readFileSync(sourcePath, 'utf8'), source);
  fs.writeFileSync(sourcePath, '{malformed');
  assert.equal((await store.convertLegacy(conversion)).status, 'failed');
  await assert.rejects(store.getState({ ...scope, sessionId: 'unknown' }), { code: 'INTERNAL_ERROR', details: { storage: 'conversion_failed' } });
  assert.deepEqual((await store.getState(scope)).items, []);
});
