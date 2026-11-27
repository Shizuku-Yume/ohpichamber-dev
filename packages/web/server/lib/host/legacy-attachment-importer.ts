import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { PromptAttachmentSchema, type PromptAttachment } from '@openchamber/agent-contract';
import { MetadataReadError } from './metadata-sqlite.js';
import type { AttachmentStore } from './attachment-store.js';

const LegacyAttachmentSchema = z.object({
  id: z.string().min(1),
  filename: z.string().min(1).max(255).refine((name) => !/[\\/\r\n\0]/.test(name)),
  mimeType: z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/).max(255),
  size: z.number().int().nonnegative().refine(Number.isSafeInteger),
  source: z.enum(['local', 'server']),
  serverPath: z.string().optional(),
  dataUrl: z.string().min(1),
});

const ScopeSchema = z.object({
  projectId: z.string().min(1),
  workspaceId: z.string().min(1),
  agentDirectoryId: z.string().min(1).optional(),
});
const PrivateScopeSchema = ScopeSchema.extend({
  agentDirectoryId: z.string().min(1),
  cwd: z.string().min(1).refine((value) => path.isAbsolute(value)),
});

export type LegacyAttachmentInput = z.infer<typeof LegacyAttachmentSchema>;
export type LegacyImportScope = z.infer<typeof ScopeSchema>;

export interface LegacyResolvedWorkspaceScope {
  projectId: string;
  workspaceId: string;
  agentDirectoryId: string;
  cwd: string;
}

export interface LegacyAttachmentImporterFs {
  realpath: typeof fs.realpath;
  open: typeof fs.open;
  stat: typeof fs.stat;
}

export interface LegacyAttachmentImporterDependencies {
  store: Pick<AttachmentStore, 'upload'>;
  resolveWorkspaceScope: (workspaceId: string) => Promise<LegacyResolvedWorkspaceScope | null>;
  maxBytes: number;
  fsPromises?: LegacyAttachmentImporterFs | undefined;
}

const within = (candidate: string, root: string): boolean => {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

const invalid = (): MetadataReadError => new MetadataReadError('Legacy attachment could not be converted');

export function createLegacyAttachmentImporter(
  dependencies: LegacyAttachmentImporterDependencies,
): (scope: LegacyImportScope, legacy: LegacyAttachmentInput) => Promise<PromptAttachment> {
  if (!z.function().safeParse(dependencies?.store?.upload).success) {
    throw new TypeError('Legacy attachment importer requires store.upload');
  }
  if (!z.function().safeParse(dependencies?.resolveWorkspaceScope).success) {
    throw new TypeError('Legacy attachment importer requires resolveWorkspaceScope');
  }
  if (!Number.isInteger(dependencies?.maxBytes) || dependencies.maxBytes <= 0) {
    throw new TypeError('Legacy attachment importer requires positive integer maxBytes');
  }
  const { store, resolveWorkspaceScope, maxBytes, fsPromises = fs } = dependencies;
  return async function importAttachment(scopeInput: LegacyImportScope, legacy: LegacyAttachmentInput): Promise<PromptAttachment> {
    const parsed = LegacyAttachmentSchema.safeParse(legacy);
    if (!parsed.success || parsed.data.size > maxBytes) throw invalid();
    const attachment = parsed.data;
    const scopeParsed = ScopeSchema.safeParse(scopeInput);
    if (!scopeParsed.success) throw invalid();
    const scope = scopeParsed.data;
    let rawPrivateScope: LegacyResolvedWorkspaceScope | null;
    try {
      rawPrivateScope = await resolveWorkspaceScope(scope.workspaceId);
    } catch {
      throw invalid();
    }
    const privateParsed = PrivateScopeSchema.safeParse(rawPrivateScope);
    if (
      !privateParsed.success
      || privateParsed.data.projectId !== scope.projectId
      || privateParsed.data.workspaceId !== scope.workspaceId
      || (scope.agentDirectoryId !== undefined && privateParsed.data.agentDirectoryId !== scope.agentDirectoryId)
    ) {
      throw invalid();
    }
    const privateScope = privateParsed.data;
    let bytes: Buffer;
    if (attachment.source === 'local') {
      if (attachment.dataUrl.length > Math.ceil(maxBytes / 3) * 4 + 512) throw invalid();
      const match = /^data:([^;,]+);base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/.exec(attachment.dataUrl);
      const mime = match?.[1];
      const encoded = match?.[2];
      if (!mime || !encoded || mime !== attachment.mimeType) throw invalid();
      bytes = Buffer.from(encoded, 'base64');
      if (bytes.length !== attachment.size || bytes.toString('base64') !== encoded) throw invalid();
    } else {
      if (!attachment.serverPath || !path.isAbsolute(attachment.serverPath) || attachment.serverPath.includes('\0')) throw invalid();
      let handle: Awaited<ReturnType<LegacyAttachmentImporterFs['open']>> | undefined;
      try {
        const candidate = path.resolve(attachment.serverPath);
        const ownedRoot = path.resolve(privateScope.cwd);
        if (!within(candidate, ownedRoot)) throw invalid();
        const target = await fsPromises.realpath(candidate);
        const canonicalRoot = await fsPromises.realpath(ownedRoot);
        if (!within(target, canonicalRoot)) throw invalid();
        handle = await fsPromises.open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
        const stat = await handle.stat();
        if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size !== attachment.size || stat.size > maxBytes) throw invalid();
        const buffer = Buffer.alloc(stat.size + 1);
        let offset = 0;
        while (offset < buffer.length) {
          const result = await handle.read(buffer, offset, buffer.length - offset, offset);
          if (result.bytesRead === 0) break;
          offset += result.bytesRead;
        }
        if (offset !== attachment.size) throw invalid();
        const after = await handle.stat();
        const canonicalAfter = await fsPromises.realpath(candidate);
        const current = await fsPromises.stat(canonicalAfter);
        if (!within(canonicalAfter, canonicalRoot) || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || current.dev !== stat.dev || current.ino !== stat.ino) {
          throw invalid();
        }
        bytes = buffer.subarray(0, offset);
        const openHandle = handle;
        handle = undefined;
        await openHandle.close();
      } catch {
        if (handle) {
          await handle.close().catch(() => { void 0; });
        }
        throw invalid();
      }
    }
    const uploaded = await store.upload(privateScope, {
      metadata: { name: attachment.filename, mediaType: attachment.mimeType, size: bytes.length },
      bytes,
    });
    return PromptAttachmentSchema.parse({
      attachmentId: uploaded.attachmentId,
      name: uploaded.name,
      mediaType: uploaded.mediaType,
      size: uploaded.size,
      uri: uploaded.uri,
    });
  };
}
