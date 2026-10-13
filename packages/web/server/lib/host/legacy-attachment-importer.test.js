import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAttachmentStore } from './attachment-store.js';
import { createLegacyAttachmentImporter } from './legacy-attachment-importer.js';
import { openHostMetadataDatabase } from './metadata-sqlite.js';

const queueScope = { sessionId: 'session', projectId: 'project', workspaceId: 'workspace' };
const local = (bytes = Buffer.from('queued text'), extra = {}) => ({ id: 'legacy', filename: 'queued.txt', mimeType: 'text/plain', size: bytes.length, source: 'local', dataUrl: `data:text/plain;base64,${bytes.toString('base64')}`, ...extra });
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-attachments-'));
  const cwd = path.join(dir, 'workspace');
  const sibling = path.join(dir, 'workspace-other');
  await fs.mkdir(cwd); await fs.mkdir(sibling);
  const database = openHostMetadataDatabase({ dataDir: dir }).db;
  const store = createAttachmentStore({ database, storageDirectory: path.join(dir, 'attachments') });
  t.after(async () => { await store.close(); database.close(); await fs.rm(dir, { recursive: true, force: true }); });
  const privateScope = { ...queueScope, agentDirectoryId: 'agent-dir', cwd };
  const options = { store, maxBytes: 1024, resolveWorkspaceScope: async (id) => id === 'workspace' ? privateScope : null };
  return { ...options, importAttachment: createLegacyAttachmentImporter(options), dir, cwd, sibling, database, privateScope };
}
const count = (database) => database.prepare('SELECT COUNT(*) AS count FROM host_attachments').get().count;

test('legacy local dataURL becomes durable opaque original bytes, not a path or legacy ID', async (t) => {
  const fixtureData = await fixture(t);
  const uploaded = await fixtureData.importAttachment(queueScope, local());
  assert.match(uploaded.attachmentId, /^att_/);
  assert.equal(uploaded.uri, `attachment://${uploaded.attachmentId}`);
  assert.equal(uploaded.createdAt, undefined);
  assert.equal(JSON.stringify(uploaded).includes(fixtureData.dir), false);
  const [reference] = await fixtureData.store.resolveAttachments(fixtureData.privateScope, [uploaded]);
  assert.deepEqual(await fs.readFile(reference.path), Buffer.from('queued text'));
  await fixtureData.store.close();
  const restarted = createAttachmentStore({ database: fixtureData.database, storageDirectory: path.join(fixtureData.dir, 'attachments') });
  t.after(() => restarted.close());
  assert.equal((await restarted.resolveAttachments(fixtureData.privateScope, [uploaded]))[0].attachmentId, uploaded.attachmentId);
});

test('server attachment is read only through Host-owned lexical and canonical roots', async (t) => {
  const f = await fixture(t);
  const filename = path.join(f.cwd, 'original.txt');
  const bytes = Buffer.from('server upload');
  await fs.writeFile(filename, bytes);
  const legacy = local(bytes, { source: 'server', serverPath: filename, dataUrl: `file://${filename}` });
  const uploaded = await f.importAttachment(queueScope, legacy);
  const [reference] = await f.store.resolveAttachments(f.privateScope, [uploaded]);
  assert.deepEqual(await fs.readFile(reference.path), bytes);
  const other = path.join(f.sibling, 'original.txt');
  await fs.writeFile(other, bytes);
  await assert.rejects(f.importAttachment(queueScope, { ...legacy, serverPath: other }), { code: 'METADATA_READ_FAILED' });
  await fs.symlink(other, path.join(f.cwd, 'escape.txt'));
  await assert.rejects(f.importAttachment(queueScope, { ...legacy, serverPath: path.join(f.cwd, 'escape.txt') }), { code: 'METADATA_READ_FAILED' });
  assert.equal(count(f.database), 1);
});

test('forged ownership, URLs, corrupted base64, sizes and traversal cannot create attachments', async (t) => {
  const f = await fixture(t);
  for (const attachment of [
    local(undefined, { dataUrl: 'https://example.invalid/file' }),
    local(undefined, { dataUrl: 'data:text/plain;base64,aGVsbG8$' }),
    local(undefined, { dataUrl: 'data:text/plain;base64,AB==' }),
    local(undefined, { mimeType: 'text/html', dataUrl: 'data:text/plain;base64,aGVsbG8=' }),
    local(undefined, { filename: '../secret' }),
    local(undefined, { size: 2000 }),
  ]) await assert.rejects(f.importAttachment(queueScope, attachment), { code: 'METADATA_READ_FAILED' });
  await assert.rejects(f.importAttachment({ ...queueScope, projectId: 'other' }, local()), { code: 'METADATA_READ_FAILED' });
  await assert.rejects(f.importAttachment({ ...queueScope, agentDirectoryId: 'other' }, local()), { code: 'METADATA_READ_FAILED' });
  await assert.rejects(f.importAttachment({ ...queueScope, workspaceId: 'unknown' }, local()), { code: 'METADATA_READ_FAILED' });
  assert.equal(count(f.database), 0);
});

test('missing or changed server bytes preserve failure instead of importing an empty attachment', async (t) => {
  const f = await fixture(t);
  const filename = path.join(f.cwd, 'missing.txt');
  const legacy = local(undefined, { source: 'server', serverPath: filename, dataUrl: `file://${filename}` });
  await assert.rejects(f.importAttachment(queueScope, legacy), { code: 'METADATA_READ_FAILED' });
  await fs.writeFile(filename, 'short');
  await assert.rejects(f.importAttachment(queueScope, legacy), { code: 'METADATA_READ_FAILED' });
  const closedStoreImporter = createLegacyAttachmentImporter(f);
  await f.store.close();
  await assert.rejects(closedStoreImporter(queueScope, local()), { code: 'METADATA_READ_FAILED' });
  assert.equal(count(f.database), 0);
});

test('same-size file replacement during read cannot acquire upload authority', async (t) => {
  const f = await fixture(t);
  const filename = path.join(f.cwd, 'queued.txt');
  const replacement = path.join(f.cwd, 'replacement.txt');
  const bytes = Buffer.from('queued text');
  await fs.writeFile(filename, bytes);
  await fs.writeFile(replacement, bytes);
  let replaced = false;
  const importer = createLegacyAttachmentImporter({
    ...f,
    fsPromises: {
      ...fs,
      open: async (...args) => {
        const handle = await fs.open(...args);
        return {
          stat: () => handle.stat(),
          close: () => handle.close(),
          read: async (...readArgs) => {
            const result = await handle.read(...readArgs);
            if (!replaced) { replaced = true; await fs.rename(replacement, filename); }
            return result;
          },
        };
      },
    },
  });
  await assert.rejects(importer(queueScope, local(bytes, { source: 'server', serverPath: filename, dataUrl: `file://${filename}` })), { code: 'METADATA_READ_FAILED' });
  assert.equal(replaced, true);
  assert.equal(count(f.database), 0);
});
