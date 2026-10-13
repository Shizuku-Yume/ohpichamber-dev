import { z } from 'zod';

const UploadSchema = z.strictObject({
  workspaceId: z.string().min(1),
  metadata: z.strictObject({ name: z.string().min(1).max(255), mediaType: z.string().min(1).max(255), size: z.number().int().nonnegative() }),
  data: z.string().min(0),
});
const Problem = (res, status, code, title) => res.status(status).json({ type: 'about:blank', title, status, code });
const validBase64 = (data) => data.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data);

export function createAttachmentRoutes({ express, store, resolveWorkspaceScope, maxBytes = 10 * 1024 * 1024 }) {
  if (!express?.Router || !store || typeof resolveWorkspaceScope !== 'function') throw new TypeError('express, store and resolveWorkspaceScope are required');
  const router = express.Router();
  router.post('/', express.json({ limit: maxBytes * 2 + 4096, strict: true }), async (req, res) => {
    const parsed = UploadSchema.safeParse(req.body);
    if (!parsed.success || !validBase64(parsed.data?.data ?? '')) return Problem(res, 400, 'INVALID_REQUEST', 'Invalid attachment request');
    const bytes = Buffer.from(parsed.data.data, 'base64');
    if (bytes.length > maxBytes || bytes.length !== parsed.data.metadata.size) return Problem(res, 413, 'ATTACHMENT_TOO_LARGE', 'Attachment exceeds the allowed size');
    let scope; try { scope = await resolveWorkspaceScope(parsed.data.workspaceId); } catch { return Problem(res, 403, 'FORBIDDEN', 'Attachment scope is not authorized'); }
    if (!scope) return Problem(res, 403, 'FORBIDDEN', 'Attachment scope is not authorized');
    try { return res.status(201).json(await store.upload(scope, { metadata: parsed.data.metadata, bytes })); } catch (error) { const status = error?.code === 'METADATA_WRITE_FAILED' ? 500 : 400; return Problem(res, status, status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST', status === 500 ? 'Attachment could not be stored' : 'Invalid attachment request'); }
  });
  router.get('/:attachmentId', async (req, res) => {
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : '';
    if (!workspaceId) return Problem(res, 400, 'INVALID_REQUEST', 'workspaceId is required');
    let scope; try { scope = await resolveWorkspaceScope(workspaceId); } catch { return Problem(res, 403, 'FORBIDDEN', 'Attachment scope is not authorized'); }
    if (!scope) return Problem(res, 403, 'FORBIDDEN', 'Attachment scope is not authorized');
    try {
      const result = await store.read(scope, req.params.attachmentId);
      res.setHeader('Content-Type', result.attachment.mediaType); res.setHeader('Content-Length', String(result.size)); res.setHeader('Content-Disposition', `attachment; filename="${result.attachment.name.replace(/["\\\r\n]/g, '_')}"`); res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.sendFile(result.path, { dotfiles: 'deny' });
    } catch (error) { if (error?.code === 'ATTACHMENT_NOT_FOUND') return Problem(res, 404, 'NOT_FOUND', 'Attachment was not found'); return Problem(res, 500, 'INTERNAL_ERROR', 'Attachment could not be read'); }
  });
  return router;
}
