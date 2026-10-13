import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAttachmentStore } from './attachment-store.js';
import { openHostMetadataDatabase } from './metadata-sqlite.js';

describe('attachment store', () => {
  let dir, database, store;
  const scope = { projectId: 'p', workspaceId: 'w', agentDirectoryId: 'a' };
  beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'att-')); database = openHostMetadataDatabase({ dataDir: dir }).db; store = createAttachmentStore({ database, storageDirectory: path.join(dir, 'attachments') }); });
  afterEach(async () => { await store.close(); database.close(); await rm(dir, { recursive: true, force: true }); });
  it('persists opaque metadata and resolves scoped files', async () => {
    const bytes = randomBytes(8); const uploaded = await store.upload(scope, { metadata: { name: 'x.txt', mediaType: 'text/plain', size: bytes.length }, bytes });
    expect(uploaded.attachmentId).toMatch(/^att_/); expect(uploaded.uri).toBe(`attachment://${uploaded.attachmentId}`);
    const { createdAt, ...submitted } = uploaded;
    const resolved = await store.resolveAttachments(scope, [submitted]); expect(resolved[0].path).toContain(`${uploaded.attachmentId}.bin`);
    await expect(store.read({ ...scope, workspaceId: 'other' }, uploaded.attachmentId)).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND' });
  });
  it('rejects forged metadata and wrong directory scope', async () => {
    const bytes = Buffer.from('hello');
    const uploaded = await store.upload(scope, { metadata: { name: 'x.txt', mediaType: 'text/plain', size: bytes.length }, bytes });
    const { createdAt, ...submitted } = uploaded;
    await expect(store.resolveAttachments(scope, [{ ...submitted, name: 'forged.txt' }])).rejects.toMatchObject({ code: 'ATTACHMENT_METADATA_MISMATCH' });
    await expect(store.resolveAttachments({ ...scope, agentDirectoryId: 'other' }, [submitted])).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND' });
  });
});
