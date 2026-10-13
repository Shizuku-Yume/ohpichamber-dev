import path from 'node:path';
import { z } from 'zod';
import { ProblemDetailsSchema } from '@openchamber/agent-contract';
const ExpressDependencySchema = z.object({ Router: z.function(), json: z.function() });
const RouteDependenciesSchema = z.object({ express: ExpressDependencySchema, store: z.object({ upload: z.function(), read: z.function() }), resolveWorkspaceScope: z.function(), maxBytes: z.number().int().positive() });

const UploadSchema = z.strictObject({
  workspaceId: z.string().min(1),
  metadata: z.strictObject({ name: z.string().min(1).max(255), mediaType: z.string().min(1).max(255), size: z.number().int().nonnegative() }),
  data: z.string(),
});
const problem = (res, status, code, detail) => {
  res.setHeader('Cache-Control', 'no-store');
  res.type('application/problem+json');
  return res.status(status).json(ProblemDetailsSchema.parse({
    type: `urn:ohpichamber:problem:${code}`, title: 'Attachment operation failed',
    status, detail, code, retryable: status >= 500,
  }));
};
const validBase64 = (data) => data.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data);

export function createAttachmentRoutes({ express, store, resolveWorkspaceScope, maxBytes = 20 * 1024 * 1024 }) {
  RouteDependenciesSchema.parse({ express: { Router: express?.Router, json: express?.json }, store, resolveWorkspaceScope, maxBytes });
  const router = express.Router();
  const authorizedScope = async (workspaceId, res) => {
    try {
      const scope = await resolveWorkspaceScope(workspaceId);
      if (scope) return scope;
      problem(res, 403, 'UNAUTHORIZED', 'Attachment scope is not authorized');
    } catch {
      problem(res, 503, 'SERVICE_UNAVAILABLE', 'Attachment scope could not be resolved');
    }
    return null;
  };
  router.post('/', (req, res, next) => {
    if (!req.is('application/json')) return problem(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Attachment upload requires application/json');
    return next();
  }, express.json({ limit: maxBytes * 2 + 4096, strict: true }), async (req, res) => {
    const parsed = UploadSchema.safeParse(req.body);
    if (!parsed.success || !validBase64(parsed.data.data)) return problem(res, 400, 'INVALID_REQUEST', 'Invalid attachment request');
    const bytes = Buffer.from(parsed.data.data, 'base64');
    if (bytes.length > maxBytes) return problem(res, 413, 'PAYLOAD_TOO_LARGE', 'Attachment exceeds the allowed size');
    if (bytes.length !== parsed.data.metadata.size) return problem(res, 400, 'INVALID_REQUEST', 'Attachment size does not match its content');
    const scope = await authorizedScope(parsed.data.workspaceId, res);
    if (!scope) return;
    try {
      return res.status(201).json(await store.upload(scope, { metadata: parsed.data.metadata, bytes }));
    } catch {
      return problem(res, 500, 'INTERNAL_ERROR', 'Attachment could not be stored');
    }
  });
  router.get('/:attachmentId', async (req, res) => {
    const workspaceResult = z.string().min(1).safeParse(req.query.workspaceId);
    if (!workspaceResult.success) return problem(res, 400, 'INVALID_REQUEST', 'workspaceId is required');
    const scope = await authorizedScope(workspaceResult.data, res);
    if (!scope) return;
    let result;
    try {
      result = await store.read(scope, req.params.attachmentId);
    } catch (error) {
      if (error.code === 'ATTACHMENT_NOT_FOUND') return problem(res, 404, 'INVALID_REQUEST', 'Attachment was not found');
      return problem(res, 500, 'INTERNAL_ERROR', 'Attachment could not be read');
    }
    res.setHeader('Content-Type', result.attachment.mediaType);
    res.setHeader('Content-Length', String(result.size));
    res.setHeader('Content-Disposition', `attachment; filename="${result.attachment.name.replace(/["\\\r\n]/g, '_')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(path.basename(result.path), { root: path.dirname(result.path), dotfiles: 'deny' }, (error) => {
      if (!error || res.destroyed) return;
      if (res.headersSent) { res.destroy(); return; }
      problem(res, 500, 'INTERNAL_ERROR', 'Attachment could not be read');
    });
  });
  router.use((error, req, res, next) => {
    if (error.type === 'entity.too.large') return problem(res, 413, 'PAYLOAD_TOO_LARGE', 'Attachment exceeds the allowed size');
    if (error.type === 'entity.parse.failed') return problem(res, 400, 'INVALID_REQUEST', 'Invalid attachment request');
    return next(error);
  });
  return router;
}
