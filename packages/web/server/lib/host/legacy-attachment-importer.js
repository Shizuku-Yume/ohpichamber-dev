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

/** The Host-resolved workspace is the only legacy file root; no shared root grants. */
export function createLegacyAttachmentImporter({ store, resolveWorkspaceScope, maxBytes, fsPromises = fs }) {
  if (typeof store?.upload !== 'function' || typeof resolveWorkspaceScope !== 'function' || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError('store, trusted workspace resolver and maxBytes are required');
  }
  return async function importAttachment(scope, legacy) {
    const parsed = LegacyAttachmentSchema.safeParse(legacy);
    if (!parsed.success || parsed.data.size > maxBytes) throw invalid();
    const attachment = parsed.data;
    let privateScope;
    try { privateScope = await resolveWorkspaceScope(scope?.workspaceId); } catch { throw invalid(); }
    if (!privateScope || !scope || ['projectId', 'workspaceId'].some((key) => typeof scope[key] !== 'string' || !scope[key] || scope[key] !== privateScope[key]) || typeof privateScope.agentDirectoryId !== 'string' || !privateScope.agentDirectoryId || (scope.agentDirectoryId !== undefined && scope.agentDirectoryId !== privateScope.agentDirectoryId)) throw invalid();
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
        if (typeof privateScope.cwd !== 'string' || !path.isAbsolute(privateScope.cwd)) throw invalid();
        const candidate = path.resolve(attachment.serverPath);
        const ownedRoot = path.resolve(privateScope.cwd);
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
