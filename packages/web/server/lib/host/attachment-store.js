import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { AttachmentSchema, PromptAttachmentSchema } from '@openchamber/agent-contract';
import { createMetadataLifecycle, MetadataCorruptError, MetadataReadError, MetadataWriteError, withTransaction } from './metadata-sqlite.js';

export const ATTACHMENT_TABLE_SQL = `CREATE TABLE IF NOT EXISTS host_attachments (
  attachment_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  agent_directory_id TEXT NOT NULL,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);`;

const id = () => `att_${crypto.randomBytes(18).toString('base64url')}`;
const scopeShape = (scope) => {
  if (!scope || typeof scope.projectId !== 'string' || typeof scope.workspaceId !== 'string' || typeof scope.agentDirectoryId !== 'string') throw new MetadataReadError('Attachment scope is invalid');
  return scope;
};
const safeName = (value) => typeof value === 'string' && value.length > 0 && value.length <= 255 && !/[\\/\r\n\0]/.test(value);
const safeMediaType = (value) => typeof value === 'string' && value.length > 0 && value.length <= 255 && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value);
const isScope = (row, scope) => row.project_id === scope.projectId && row.workspace_id === scope.workspaceId && row.agent_directory_id === scope.agentDirectoryId;

export function createAttachmentStore({ database, storageDirectory, fsPromises = fs, now = () => Date.now() }) {
  if (!database || typeof database.prepare !== 'function' || !storageDirectory) throw new TypeError('database and storageDirectory are required');
  database.exec(ATTACHMENT_TABLE_SQL);
  const lifecycle = createMetadataLifecycle(database, false);
  const ensureDir = () => fsPromises.mkdir(storageDirectory, { recursive: true, mode: 0o700 });
  const filePath = (name) => path.join(storageDirectory, name);
  const get = (attachmentId) => {
    if (typeof attachmentId !== 'string' || !/^att_[A-Za-z0-9_-]{24}$/.test(attachmentId)) throw new MetadataCorruptError('Attachment identifier is invalid');
    let row; try { row = database.prepare('SELECT * FROM host_attachments WHERE attachment_id = ?').get(attachmentId); } catch (error) { throw new MetadataReadError('Attachment metadata could not be read', error); }
    if (!row) return null;
    if (typeof row.storage_name !== 'string' || !/^att_[A-Za-z0-9_-]{24}\.bin$/.test(row.storage_name) || typeof row.name !== 'string' || !safeName(row.name) || !safeMediaType(row.media_type) || !Number.isSafeInteger(row.size) || row.size < 0 || typeof row.project_id !== 'string' || typeof row.workspace_id !== 'string' || typeof row.agent_directory_id !== 'string') throw new MetadataCorruptError('Attachment metadata is corrupt');
    return row;
  };
  const toPublic = (row) => AttachmentSchema.parse({ attachmentId: row.attachment_id, name: row.name, mediaType: row.media_type, size: row.size, uri: `attachment://${row.attachment_id}`, createdAt: row.created_at });
  const upload = async (scopeInput, payload) => lifecycle.run(async () => {
    const scope = scopeShape(scopeInput);
    const metadata = PromptAttachmentSchema.omit({ attachmentId: true, uri: true }).safeParse(payload?.metadata);
    if (!metadata.success || !safeName(metadata.data.name) || !safeMediaType(metadata.data.mediaType)) throw new MetadataWriteError('Invalid attachment metadata');
    if (!Buffer.isBuffer(payload?.bytes) && !(payload?.bytes instanceof Uint8Array)) throw new MetadataWriteError('Attachment bytes are required');
    const bytes = Buffer.from(payload.bytes); if (bytes.length !== metadata.data.size) throw new MetadataWriteError('Attachment size does not match metadata');
    const attachmentId = id(); const storageName = `${attachmentId}.bin`; const target = filePath(storageName);
    await ensureDir();
    try {
      await fsPromises.writeFile(target, bytes, { mode: 0o600, flag: 'wx' });
      try { withTransaction(database, () => database.prepare('INSERT INTO host_attachments (attachment_id,project_id,workspace_id,agent_directory_id,name,media_type,size,storage_name,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(attachmentId, scope.projectId, scope.workspaceId, scope.agentDirectoryId, metadata.data.name, metadata.data.mediaType, bytes.length, storageName, now())); } catch (error) { throw new MetadataWriteError('Attachment metadata could not be written', error); }
      return toPublic(get(attachmentId));
    } catch (error) { try { await fsPromises.rm(target, { force: true }); } catch (cleanup) { throw new MetadataWriteError('Attachment cleanup failed', cleanup); } if (error instanceof MetadataWriteError) throw error; throw new MetadataWriteError('Attachment bytes could not be stored', error); }
  });
  const read = async (scopeInput, attachmentId, submitted) => lifecycle.run(async () => {
    const scope = scopeShape(scopeInput); const row = get(attachmentId);
    if (!row || !isScope(row, scope)) throw Object.assign(new Error('Attachment not found'), { code: 'ATTACHMENT_NOT_FOUND' });
    if (submitted !== undefined) { const parsed = PromptAttachmentSchema.safeParse(submitted); if (!parsed.success || parsed.data.attachmentId !== row.attachment_id || parsed.data.name !== row.name || parsed.data.mediaType !== row.media_type || parsed.data.size !== row.size || parsed.data.uri !== `attachment://${row.attachment_id}`) throw Object.assign(new Error('Attachment metadata mismatch'), { code: 'ATTACHMENT_METADATA_MISMATCH' }); }
    try { const stat = await fsPromises.stat(filePath(row.storage_name)); if (!stat.isFile() || stat.size !== row.size) throw new Error('Attachment file is invalid'); return { attachment: toPublic(row), path: filePath(row.storage_name), size: row.size }; } catch (error) { throw Object.assign(new Error('Attachment content could not be read', { cause: error }), { code: 'ATTACHMENT_IO_FAILED' }); }
  });
  const resolveAttachments = async (scope, attachments) => { if (attachments === undefined || attachments === null) return []; if (!Array.isArray(attachments)) throw new MetadataReadError('Attachment list is invalid'); return Promise.all(attachments.map(async (attachment) => { const result = await read(scope, attachment?.attachmentId, attachment); return { attachmentId: result.attachment.attachmentId, path: result.path }; })); };
  return { upload, read, resolveAttachments, close: lifecycle.close, flush: lifecycle.flush, schemaSql: ATTACHMENT_TABLE_SQL };
}
