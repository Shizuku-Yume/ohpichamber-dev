import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  JsonObjectSchema, ProblemCodeSchema, ProblemDetailsSchema, QueueAppendRequestSchema,
  QueueDeleteRequestSchema, QueueReorderRequestSchema, QueueStateSchema, QueueTakeRequestSchema, QueueTakeResultSchema,
  type ProblemCode, type ProblemDetails, type QueueAppendRequest, type QueueDeleteRequest,
  type QueueOriginalDraft, type QueueReorderRequest, type QueueState, type QueueTakeRequest, type QueueTakeResult,
} from '@openchamber/agent-contract';
import { createCanonicalQueueRuntime } from './canonical-runtime.js';
import { createPromptQueueStore, PromptQueueError } from './sqlite-store.js';
import { controlErrorFields } from '../openchamber-control/error.js';
import { isString } from '../shared/guards.js';
import type { Application, Response, Router } from '../shared/http-contracts.js';
import type { JsonValue } from '../shared/json-values.js';

export { createCanonicalQueueRuntime, createPromptQueueStore };

export interface QueueSessionScope {
  sessionId: string;
  projectId: string;
  workspaceId: string;
  cwd?: string;
  agentDirectory?: string;
}

export interface QueueScopeListing {
  items: QueueSessionScope[];
  errors: Array<{ code?: string }>;
}

export interface QueueStoredEntry {
  draft?: QueueOriginalDraft | undefined;
  request: { input: { text: string } };
  content: string;
  createdAt: number;
}

export interface QueueHoldResult {
  held: boolean;
  expiresAt: number | null;
}

export interface MessageQueueRuntime {
  getState: (scope: QueueSessionScope) => Promise<QueueState>;
  append: (scope: QueueSessionScope, commandId: string, request: QueueAppendRequest) => Promise<QueueState>;
  reorder: (scope: QueueSessionScope, request: QueueReorderRequest) => Promise<QueueState>;
  remove: (scope: QueueSessionScope, request: QueueDeleteRequest) => Promise<QueueState>;
  take: (scope: QueueSessionScope, request: QueueTakeRequest) => Promise<{ queue: QueueState; stored: QueueStoredEntry }>;
  setHold: (scope: QueueSessionScope, held: boolean, ttlMs?: number) => QueueHoldResult;
}

export interface MessageQueueRouteDependencies {
  resolveSessionScope: (sessionId: string) => Promise<QueueSessionScope | null>;
  listQueueScopes: () => Promise<QueueScopeListing>;
}

export interface CanonicalQueueRouteDependencies {
  resolveSessionScope: (sessionId: string) => Promise<QueueSessionScope | null>;
}

const BodyRecordSchema = z.record(z.string(), z.unknown());
const ItemIdBodySchema = z.looseObject({ queueItemId: z.string().optional() });
const HoldBodySchema = z.object({
  held: z.boolean(),
  ttlMs: z.number().finite().positive().optional(),
});

const isInteger = (value: unknown): value is number => Number.isInteger(value);

const scopeFor = async (
  resolveSessionScope: (sessionId: string) => Promise<QueueSessionScope | null>,
  sessionId: string,
): Promise<QueueSessionScope> => {
  const scope = await resolveSessionScope(sessionId);
  if (!scope || scope.sessionId !== sessionId) throw new PromptQueueError('SESSION_NOT_FOUND', 404, 'Session scope is not available');
  return scope;
};

const respondError = (res: Response, cause: Parameters<typeof controlErrorFields>[0], fallback: string): void => {
  const fields = controlErrorFields(cause);
  const rawStatus = fields?.status;
  const isZod = cause instanceof z.ZodError || (cause instanceof Error && cause.name === 'ZodError');
  const status = isInteger(rawStatus) ? rawStatus : (isZod ? 400 : 500);
  const parsedCode = ProblemCodeSchema.safeParse(fields?.code);
  const code: ProblemCode = parsedCode.success ? parsedCode.data : status === 400 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR';
  const detail = cause instanceof PromptQueueError ? cause.message : fallback;
  const problemInput: ProblemDetails = {
    type: `urn:ohpichamber:problem:${code}`, title: detail, status, detail, code,
    retryable: status >= 500,
  };
  if (cause instanceof PromptQueueError && cause.details) {
    problemInput.details = JsonObjectSchema.parse(cause.details);
  }
  const problem = ProblemDetailsSchema.parse(problemInput);
  res.status(status).type('application/problem+json').json(problem);
};

interface AppendQueueInput {
  commandId: string | undefined;
  request: QueueAppendRequest;
}

const appendInput = (body: JsonValue | undefined): AppendQueueInput => {
  const record = BodyRecordSchema.parse(body ?? {});
  const { commandId: rawCommandId, ...request } = record;
  const commandId = rawCommandId === undefined ? undefined : z.string().parse(rawCommandId);
  return { commandId, request: QueueAppendRequestSchema.parse(request) };
};

const deleteInput = (body: JsonValue | undefined, queueItemId: string): QueueDeleteRequest => {
  const parsedBody = ItemIdBodySchema.parse(body ?? {});
  if (parsedBody.queueItemId !== undefined && parsedBody.queueItemId !== queueItemId) {
    throw new PromptQueueError('INVALID_REQUEST', 400, 'Queue item identity must match its route');
  }
  return QueueDeleteRequestSchema.parse({ ...parsedBody, queueItemId });
};

const takeInput = (body: JsonValue | undefined, queueItemId: string): QueueTakeRequest => {
  const parsedBody = ItemIdBodySchema.parse(body ?? {});
  if (parsedBody.queueItemId !== undefined && parsedBody.queueItemId !== queueItemId) {
    throw new PromptQueueError('INVALID_REQUEST', 400, 'Queue item identity must match its route');
  }
  return QueueTakeRequestSchema.parse({ ...parsedBody, queueItemId });
};

const takeResult = async (
  runtime: MessageQueueRuntime,
  scope: QueueSessionScope,
  body: JsonValue | undefined,
  queueItemId: string,
): Promise<QueueTakeResult> => {
  const taken = await runtime.take(scope, takeInput(body, queueItemId));
  return QueueTakeResultSchema.parse({
    queue: taken.queue,
    draft: taken.stored.draft ?? null,
    text: taken.stored.request.input.text,
    content: taken.stored.content,
    createdAt: taken.stored.createdAt,
  });
};

export function registerMessageQueueRoutes(
  app: Application,
  runtime: MessageQueueRuntime,
  { resolveSessionScope, listQueueScopes }: MessageQueueRouteDependencies,
): void {
  app.get('/api/message-queue', async (_req, res) => {
    try {
      const listed = await listQueueScopes();
      if (!listed || !Array.isArray(listed.items) || !Array.isArray(listed.errors)) {
        throw new PromptQueueError('INTERNAL_ERROR', 503, 'Queue scope listing is unavailable');
      }
      const items: QueueState[] = [];
      let maxRevision = 0;
      const errors = listed.errors.map((entry) => {
        const parsed = ProblemCodeSchema.safeParse(entry?.code);
        return { code: parsed.success ? parsed.data : 'INTERNAL_ERROR' };
      });
      for (const scope of listed.items) {
        try {
          const state = QueueStateSchema.parse(await runtime.getState(scope));
          items.push(state);
          const rev = Number(state.revision) || 0;
          if (rev > maxRevision) maxRevision = rev;
        } catch (error) {
          const parsed = ProblemCodeSchema.safeParse(controlErrorFields(error)?.code);
          errors.push({ code: parsed.success ? parsed.data : 'INTERNAL_ERROR' });
        }
      }
      res.json({ revision: maxRevision, items, errors });
    } catch (error) { respondError(res, error, 'Failed to load message queue'); }
  });

  app.post<JsonValue | undefined>('/api/message-queue/sessions/:sessionId/items', async (req, res) => {
    try {
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId ?? '');
      const { commandId: bodyCommandId, request } = appendInput(req.body);
      const idempotencyKey = req.get('Idempotency-Key');
      const commandId = bodyCommandId ?? (isString(idempotencyKey) ? idempotencyKey : undefined) ?? randomUUID();
      res.json(QueueStateSchema.parse(await runtime.append(scope, commandId, request)));
    } catch (error) { respondError(res, error, 'Failed to queue message'); }
  });

  app.put<JsonValue | undefined>('/api/message-queue/sessions/:sessionId/order', async (req, res) => {
    try {
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId ?? '');
      res.json(QueueStateSchema.parse(await runtime.reorder(scope, QueueReorderRequestSchema.parse(req.body))));
    } catch (error) { respondError(res, error, 'Failed to reorder queue'); }
  });

  app.delete<JsonValue | undefined>('/api/message-queue/sessions/:sessionId/items/:itemId', async (req, res) => {
    try {
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId ?? '');
      res.json(QueueStateSchema.parse(await runtime.remove(scope, deleteInput(req.body, req.params.itemId ?? ''))));
    } catch (error) { respondError(res, error, 'Failed to remove queued message'); }
  });

  app.post<JsonValue | undefined>('/api/message-queue/sessions/:sessionId/items/:itemId/take', async (req, res) => {
    try {
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId ?? '');
      res.json(await takeResult(runtime, scope, req.body, req.params.itemId ?? ''));
    } catch (error) { respondError(res, error, 'Failed to take queued message'); }
  });

  app.put<JsonValue | undefined>('/api/message-queue/sessions/:sessionId/hold', async (req, res) => {
    try {
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId ?? '');
      const { held, ttlMs } = HoldBodySchema.parse(req.body ?? {});
      res.json(runtime.setHold(scope, held, ttlMs));
    } catch (error) { respondError(res, error, 'Failed to update queue hold'); }
  });
}

export function registerCanonicalQueueRoutes(
  router: Router,
  runtime: MessageQueueRuntime,
  { resolveSessionScope }: CanonicalQueueRouteDependencies,
): void {
  const scope = (id: string) => scopeFor(resolveSessionScope, id);
  router.get('/sessions/:sessionId/queue', async (req, res) => {
    try { res.json(QueueStateSchema.parse(await runtime.getState(await scope(req.params.sessionId ?? '')))); }
    catch (error) { respondError(res, error, 'Failed to load prompt queue'); }
  });
  router.post<JsonValue | undefined>('/sessions/:sessionId/queue', async (req, res) => {
    try {
      const { commandId: bodyCommandId, request } = appendInput(req.body);
      const idempotencyKey = req.get('Idempotency-Key');
      const commandId = bodyCommandId ?? (isString(idempotencyKey) ? idempotencyKey : undefined) ?? randomUUID();
      res.json(QueueStateSchema.parse(await runtime.append(await scope(req.params.sessionId ?? ''), commandId, request)));
    } catch (error) { respondError(res, error, 'Failed to append prompt queue'); }
  });
  router.put<JsonValue | undefined>('/sessions/:sessionId/queue/order', async (req, res) => {
    try { res.json(QueueStateSchema.parse(await runtime.reorder(await scope(req.params.sessionId ?? ''), QueueReorderRequestSchema.parse(req.body)))); }
    catch (error) { respondError(res, error, 'Failed to reorder prompt queue'); }
  });
  router.delete<JsonValue | undefined>('/sessions/:sessionId/queue/:queueItemId', async (req, res) => {
    try { res.json(QueueStateSchema.parse(await runtime.remove(await scope(req.params.sessionId ?? ''), deleteInput(req.body, req.params.queueItemId ?? '')))); }
    catch (error) { respondError(res, error, 'Failed to remove prompt queue item'); }
  });
  router.post<JsonValue | undefined>('/sessions/:sessionId/queue/:queueItemId/take', async (req, res) => {
    try { res.json(await takeResult(runtime, await scope(req.params.sessionId ?? ''), req.body, req.params.queueItemId ?? '')); }
    catch (error) { respondError(res, error, 'Failed to take prompt queue item'); }
  });
}
