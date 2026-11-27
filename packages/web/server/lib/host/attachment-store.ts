import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { AttachmentSchema, PromptAttachmentSchema, type Attachment, type PromptAttachment } from '@openchamber/agent-contract';
import { createMetadataLifecycle, MetadataCorruptError, MetadataReadError, MetadataWriteError, withTransaction } from './metadata-sqlite.js';

const id = (): string => `att_${crypto.randomBytes(18).toString('base64url')}`;

const ScopeSchema = z.object({ projectId: z.string().min(1), workspaceId: z.string().min(1), agentDirectoryId: z.string().min(1) });
const AttachmentNameSchema = z.string().min(1).max(255).refine((value) => !/[\\/\r\n\0]/.test(value));
const MediaTypeSchema = z.string().min(1).max(255).regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/);
const UploadMetadataSchema = z.strictObject({ name: AttachmentNameSchema, mediaType: MediaTypeSchema, size: z.number().int().nonnegative() });
const AttachmentRowSchema = z.object({
  attachment_id: z.string().regex(/^att_[A-Za-z0-9_-]{24}$/),
  project_id: z.string().min(1),
  workspace_id: z.string().min(1),
  agent_directory_id: z.string().min(1),
  name: AttachmentNameSchema,
  media_type: MediaTypeSchema,
  size: z.number().int().nonnegative().refine(Number.isSafeInteger),
  storage_name: z.string().regex(/^att_[A-Za-z0-9_-]{24}\.bin$/),
  created_at: z.number(),
});

export type AttachmentScope = z.infer<typeof ScopeSchema>;
export type AttachmentUploadMetadata = z.infer<typeof UploadMetadataSchema>;
type AttachmentRow = z.infer<typeof AttachmentRowSchema>;

export interface AttachmentUploadPayload {
  metadata: AttachmentUploadMetadata;
  bytes: Uint8Array | Buffer;
}

export interface AttachmentReadResult {
  attachment: Attachment;
  path: string;
  size: number;
}

export interface ResolvedAttachmentPath {
  attachmentId: string;
  path: string;
}

export interface AttachmentStoreFs {
  mkdir: typeof fs.mkdir;
  writeFile: typeof fs.writeFile;
  rm: typeof fs.rm;
  stat: typeof fs.stat;
  readFile: typeof fs.readFile;
}

export interface CreateAttachmentStoreOptions {
  database: DatabaseSync;
  storageDirectory: string;
  fsPromises?: AttachmentStoreFs | undefined;
  now?: (() => number) | undefined;
}

export interface AttachmentStore {
  upload(scopeInput: AttachmentScope, payload: AttachmentUploadPayload): Promise<Attachment>;
  read(scopeInput: AttachmentScope, attachmentId: string, submitted?: PromptAttachment): Promise<AttachmentReadResult>;
  resolveAttachments(scope: AttachmentScope, attachments: readonly PromptAttachment[] | null | undefined): Promise<ResolvedAttachmentPath[]>;
  close(): Promise<void>;
  flush(): Promise<void>;
}

const isScope = (row: AttachmentRow, scope: AttachmentScope): boolean =>
  row.project_id === scope.projectId && row.workspace_id === scope.workspaceId && row.agent_directory_id === scope.agentDirectoryId;

const requireBytes = (bytes: Uint8Array | Buffer | undefined): Buffer => {
  if (!(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array)) throw new MetadataWriteError('Attachment bytes are required');
  return Buffer.from(bytes);
};

const MAX_PROMPT_ATTACHMENT_CHARS = 1_000_000;

export function createAttachmentStore({
  database,
  storageDirectory,
  fsPromises = fs,
  now = () => Date.now(),
}: CreateAttachmentStoreOptions): AttachmentStore {
  if (!database || !storageDirectory) throw new TypeError('database and storageDirectory are required');
  const lifecycle = createMetadataLifecycle(database, false);
  const ensureDir = () => fsPromises.mkdir(storageDirectory, { recursive: true, mode: 0o700 });
  const filePath = (name: string) => path.join(storageDirectory, name);
  const get = (attachmentId: string): AttachmentRow | null => {
    if (!/^att_[A-Za-z0-9_-]{24}$/.test(attachmentId)) throw new MetadataCorruptError('Attachment identifier is invalid');
    const rawRow = (() => {
      try {
        return database.prepare('SELECT * FROM host_attachments WHERE attachment_id = ?').get(attachmentId);
      } catch (error) {
        throw new MetadataReadError('Attachment metadata could not be read', error);
      }
    })();
    if (!rawRow) return null;
    const parsed = AttachmentRowSchema.safeParse(rawRow);
    if (!parsed.success) throw new MetadataCorruptError('Attachment metadata is corrupt');
    return parsed.data;
  };
  const toPublic = (row: AttachmentRow): Attachment =>
    AttachmentSchema.parse({
      attachmentId: row.attachment_id,
      name: row.name,
      mediaType: row.media_type,
      size: row.size,
      uri: `attachment://${row.attachment_id}`,
      createdAt: row.created_at,
    });
  const upload = async (scopeInput: AttachmentScope, payload: AttachmentUploadPayload): Promise<Attachment> => lifecycle.run(async () => {
    const scopeResult = ScopeSchema.safeParse(scopeInput);
    if (!scopeResult.success) throw new MetadataReadError('Attachment scope is invalid');
    const scope = scopeResult.data;
    const metadata = UploadMetadataSchema.safeParse(payload?.metadata);
    if (!metadata.success) throw new MetadataWriteError('Invalid attachment metadata');
    const bytes = requireBytes(payload?.bytes);
    if (bytes.length !== metadata.data.size) throw new MetadataWriteError('Attachment size does not match metadata');
    const attachmentId = id();
    const storageName = `${attachmentId}.bin`;
    const target = filePath(storageName);
    await ensureDir();
    try {
      await fsPromises.writeFile(target, bytes, { mode: 0o600, flag: 'wx' });
      try {
        withTransaction(database, () => database.prepare('INSERT INTO host_attachments (attachment_id,project_id,workspace_id,agent_directory_id,name,media_type,size,storage_name,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(attachmentId, scope.projectId, scope.workspaceId, scope.agentDirectoryId, metadata.data.name, metadata.data.mediaType, bytes.length, storageName, now()));
      } catch (error) {
        throw new MetadataWriteError('Attachment metadata could not be written', error);
      }
      const inserted = get(attachmentId);
      if (!inserted) throw new MetadataWriteError('Attachment metadata could not be written');
      return toPublic(inserted);
    } catch (error) {
      try {
        await fsPromises.rm(target, { force: true });
      } catch (cleanup) {
        throw new MetadataWriteError('Attachment cleanup failed', cleanup);
      }
      if (error instanceof MetadataWriteError) throw error;
      throw new MetadataWriteError('Attachment bytes could not be stored', error);
    }
  });
  const read = async (scopeInput: AttachmentScope, attachmentId: string, submitted?: PromptAttachment): Promise<AttachmentReadResult> => lifecycle.run(async () => {
    const scopeResult = ScopeSchema.safeParse(scopeInput);
    if (!scopeResult.success) throw new MetadataReadError('Attachment scope is invalid');
    const scope = scopeResult.data;
    const row = get(attachmentId);
    if (!row || !isScope(row, scope)) throw Object.assign(new Error('Attachment not found'), { code: 'ATTACHMENT_NOT_FOUND' });
    if (submitted !== undefined) {
      const parsed = PromptAttachmentSchema.safeParse(submitted);
      if (!parsed.success || parsed.data.attachmentId !== row.attachment_id || parsed.data.name !== row.name || parsed.data.mediaType !== row.media_type || parsed.data.size !== row.size || parsed.data.uri !== `attachment://${row.attachment_id}`) {
        throw Object.assign(new Error('Attachment metadata mismatch'), { code: 'ATTACHMENT_METADATA_MISMATCH' });
      }
    }
    try {
      const stat = await fsPromises.stat(filePath(row.storage_name));
      if (!stat.isFile() || stat.size !== row.size) throw new Error('Attachment file is invalid');
      return { attachment: toPublic(row), path: filePath(row.storage_name), size: row.size };
    } catch (error) {
      throw Object.assign(new Error('Attachment content could not be read', { cause: error }), { code: 'ATTACHMENT_IO_FAILED' });
    }
  });
  const resolveAttachments = async (
    scope: AttachmentScope,
    attachments: readonly PromptAttachment[] | null | undefined,
  ): Promise<ResolvedAttachmentPath[]> => {
    if (attachments === undefined || attachments === null) return [];
    if (!Array.isArray(attachments)) throw new MetadataReadError('Attachment list is invalid');
    let textCharacters = 0;
    return Promise.all(attachments.map(async (attachment) => {
      const result = await read(scope, attachment?.attachmentId, attachment);
      if (result.attachment.mediaType.startsWith('image/')) return { attachmentId: result.attachment.attachmentId, path: result.path };
      if (result.size <= MAX_PROMPT_ATTACHMENT_CHARS) {
        try {
          const bytes = await fsPromises.readFile(result.path);
          if (!bytes.includes(0)) textCharacters += new TextDecoder('utf-8', { fatal: true }).decode(bytes).length;
        } catch {
          void 0;
        }
        if (textCharacters > MAX_PROMPT_ATTACHMENT_CHARS) {
          throw Object.assign(new Error('Text attachments exceed 1,000,000 characters'), { code: 'PAYLOAD_TOO_LARGE', statusCode: 413 });
        }
      }
      return { attachmentId: result.attachment.attachmentId, path: result.path };
    }));
  };
  return { upload, read, resolveAttachments, close: lifecycle.close, flush: lifecycle.flush };
}
