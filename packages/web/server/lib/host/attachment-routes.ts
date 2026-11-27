import path from 'node:path';
import { z } from 'zod';
import { ProblemDetailsSchema, type ProblemCode } from '@openchamber/agent-contract';
import type { ErrorRequestHandler, ExpressFactory, Request, Response, Router } from '../shared/http-contracts.js';
import type { AttachmentScope, AttachmentStore } from './attachment-store.js';

const ErrorCodeSchema = z.object({ code: z.string() });
const BodyParserErrorSchema = z.object({ type: z.string() });

export interface AttachmentRoutesDependencies {
  express: Pick<ExpressFactory, 'Router' | 'json'>;
  store: Pick<AttachmentStore, 'upload' | 'read'>;
  resolveWorkspaceScope: (workspaceId: string) => Promise<AttachmentScope | null>;
  maxBytes?: number | undefined;
}

const UploadSchema = z.strictObject({
  workspaceId: z.string().min(1),
  metadata: z.strictObject({ name: z.string().min(1).max(255), mediaType: z.string().min(1).max(255), size: z.number().int().nonnegative() }),
  data: z.string(),
});

const problem = (res: Response, status: number, code: ProblemCode, detail: string): Response => {
  res.setHeader('Cache-Control', 'no-store');
  res.type('application/problem+json');
  return res.status(status).json(ProblemDetailsSchema.parse({
    type: `urn:ohpichamber:problem:${code}`,
    title: 'Attachment operation failed',
    status,
    detail,
    code,
    retryable: status >= 500,
  }));
};

const validBase64 = (data: string): boolean => data.length % 4 === 0 && !/[^A-Za-z0-9+/=]/.test(data);

export function createAttachmentRoutes({
  express,
  store,
  resolveWorkspaceScope,
  maxBytes = 20 * 1024 * 1024,
}: AttachmentRoutesDependencies): Router {
  if (!z.function().safeParse(express?.Router).success || !z.function().safeParse(express?.json).success) {
    throw new TypeError('Attachment routes require express Router and json');
  }
  if (!z.function().safeParse(store?.upload).success || !z.function().safeParse(store?.read).success) {
    throw new TypeError('Attachment routes require store upload and read');
  }
  if (!z.function().safeParse(resolveWorkspaceScope).success) {
    throw new TypeError('Attachment routes require resolveWorkspaceScope');
  }
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError('Attachment routes require positive integer maxBytes');
  }
  const router = express.Router();
  const authorizedScope = async (workspaceId: string, res: Response): Promise<AttachmentScope | null> => {
    try {
      const scope = await resolveWorkspaceScope(workspaceId);
      if (scope) return scope;
      problem(res, 403, 'UNAUTHORIZED', 'Attachment scope is not authorized');
    } catch {
      problem(res, 503, 'SERVICE_UNAVAILABLE', 'Attachment scope could not be resolved');
    }
    return null;
  };
  router.post(
    '/',
    (req, res, next) => {
      if (!req.is('application/json')) return problem(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Attachment upload requires application/json');
      return next();
    },
    (req, res, next) => express.json({ limit: maxBytes * 2 + 4096, strict: true })(req, res, next),
    async (req, res) => {
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
    },
  );
  router.get('/:attachmentId', async (req: Request, res: Response) => {
    const workspaceResult = z.string().min(1).safeParse(req.query.workspaceId);
    if (!workspaceResult.success) return problem(res, 400, 'INVALID_REQUEST', 'workspaceId is required');
    const attachmentIdResult = z.string().min(1).safeParse(req.params.attachmentId);
    if (!attachmentIdResult.success) return problem(res, 400, 'INVALID_REQUEST', 'attachmentId is required');
    const scope = await authorizedScope(workspaceResult.data, res);
    if (!scope) return;
    try {
      const result = await store.read(scope, attachmentIdResult.data);
      res.setHeader('Content-Type', result.attachment.mediaType);
      res.setHeader('Content-Length', String(result.size));
      res.setHeader('Content-Disposition', `attachment; filename="${result.attachment.name.replace(/["\\\r\n]/g, '_')}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.sendFile(path.basename(result.path), { root: path.dirname(result.path), dotfiles: 'deny' }, (error) => {
        if (!error || res.destroyed) return;
        if (res.headersSent) { res.destroy(); return; }
        problem(res, 500, 'INTERNAL_ERROR', 'Attachment could not be read');
      });
    } catch (error) {
      const parsedError = ErrorCodeSchema.safeParse(error);
      if (parsedError.success && parsedError.data.code === 'ATTACHMENT_NOT_FOUND') {
        return problem(res, 404, 'INVALID_REQUEST', 'Attachment was not found');
      }
      return problem(res, 500, 'INTERNAL_ERROR', 'Attachment could not be read');
    }
  });
  const handleBodyParserError: ErrorRequestHandler = (error, _req, res, next) => {
    const parsed = BodyParserErrorSchema.safeParse(error);
    if (parsed.success && parsed.data.type === 'entity.too.large') {
      return problem(res, 413, 'PAYLOAD_TOO_LARGE', 'Attachment exceeds the allowed size');
    }
    if (parsed.success && parsed.data.type === 'entity.parse.failed') {
      return problem(res, 400, 'INVALID_REQUEST', 'Invalid attachment request');
    }
    return next(error);
  };
  router.use(handleBodyParserError);
  return router;
}
