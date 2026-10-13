import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { PromptAttachmentSchema } from '@openchamber/agent-contract';
import { MetadataReadError } from './metadata-sqlite.js';

const LegacyAttachmentSchema = z.object({
  id: z.string().min(1),
  filename: z.string().min(1).max(255).refine((name) => !/[\\/\r\n\0]/.test(name)),
  mimeType: z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/).max(255),
  size: z.number().int().nonnegative().safe(),
  source: z.enum(['local', 'server']),
  serverPath: z.string().optional(),
  dataUrl: z.string().min(1),
});
const within = (candidate, root) => {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
const invalid = () => new MetadataReadError('Legacy attachment could not be converted');
const ScopeSchema = z.object({ projectId: z.string().min(1), workspaceId: z.string().min(1), agentDirectoryId: z.string().min(1).optional() });
const PrivateScopeSchema = ScopeSchema.extend({ agentDirectoryId: z.string().min(1) });
const RootSchema = z.string().min(1).refine((value) => path.isAbsolute(value));
const StoreSchema = z.object({ upload: z.function() });
const FilesystemSchema = z.object({ realpath: z.function(), open: z.function(), stat: z.function() });
const DependenciesSchema = z.object({ store: StoreSchema, resolveWorkspaceScope: z.function(), maxBytes: z.number().int().positive(), fsPromises: FilesystemSchema.optional() });
const validScope = (value) => ScopeSchema.safeParse(value).success;
export function createLegacyAttachmentImporter(dependencies) {
  const parsedDependencies = DependenciesSchema.parse(dependencies);
  const { store, resolveWorkspaceScope, maxBytes, fsPromises = fs } = parsedDependencies;
  return async function importAttachment(scope, legacy) {
    const parsed = LegacyAttachmentSchema.safeParse(legacy);
    if (!parsed.success || parsed.data.size > maxBytes) throw invalid();
    const attachment = parsed.data;
    let privateScope;
    try { privateScope = await resolveWorkspaceScope(scope?.workspaceId); } catch { throw invalid(); }
    if (!PrivateScopeSchema.safeParse(privateScope).success || !validScope(scope) || privateScope.projectId !== scope.projectId || privateScope.workspaceId !== scope.workspaceId || (scope.agentDirectoryId !== undefined && privateScope.agentDirectoryId !== scope.agentDirectoryId)) throw invalid();
    let bytes;
    if (attachment.source === 'local') {
      // FileReader's retained representation is a base64 data URL. Never fetch URLs.
      if (attachment.dataUrl.length > Math.ceil(maxBytes / 3) * 4 + 512) throw invalid();
      const match = /^data:([^;,]+);base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/.exec(attachment.dataUrl);
      if (!match || match[1] !== attachment.mimeType) throw invalid();
      bytes = Buffer.from(match[2], 'base64');
      if (bytes.length !== attachment.size || bytes.toString('base64') !== match[2]) throw invalid();
    } else {
      if (!attachment.serverPath || !path.isAbsolute(attachment.serverPath) || attachment.serverPath.includes('\0')) throw invalid();
      let handle;
      try {
        const ownedRootResult = RootSchema.safeParse(privateScope.cwd); if (!ownedRootResult.success) throw invalid();
        const candidate = path.resolve(attachment.serverPath);
        const ownedRoot = path.resolve(ownedRootResult.data);
        if (!within(candidate, ownedRoot)) throw invalid();
        const target = await fsPromises.realpath(candidate);
        const canonicalRoot = await fsPromises.realpath(ownedRoot);
        if (!within(target, canonicalRoot)) throw invalid();
        handle = await fsPromises.open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
        const stat = await handle.stat();
        if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size !== attachment.size || stat.size > maxBytes) throw invalid();
        // Read at most the declared size plus one byte, including concurrent growth.
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
        if (!within(canonicalAfter, canonicalRoot) || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || current.dev !== stat.dev || current.ino !== stat.ino) throw invalid();
        bytes = buffer.subarray(0, offset);
      } catch { throw invalid(); }
      finally { if (handle) { try { await handle.close(); } catch { throw invalid(); } } }
    }
    const uploaded = await store.upload(privateScope, { metadata: { name: attachment.filename, mediaType: attachment.mimeType, size: bytes.length }, bytes });
    return PromptAttachmentSchema.parse({ attachmentId: uploaded.attachmentId, name: uploaded.name, mediaType: uploaded.mediaType, size: uploaded.size, uri: uploaded.uri });
  };
}
