<<<<<<< HEAD:packages/web/server/lib/message-queue/runtime.js
import { randomUUID } from 'node:crypto';
import {
  ProblemCodeSchema, ProblemDetailsSchema, QueueAppendRequestSchema,
  QueueDeleteRequestSchema, QueueReorderRequestSchema, QueueStateSchema,
} from '@openchamber/agent-contract';
import { createCanonicalQueueRuntime } from './canonical-runtime.js';
import { createPromptQueueStore, PromptQueueError } from './sqlite-store.js';

/**
 * Canonical queue construction is deliberately split from Host composition:
 * SQLite owns durable queue state and the OMP service owns execution admission.
 */
export { createCanonicalQueueRuntime, createPromptQueueStore };
const scopeFor = async (resolveSessionScope, sessionId) => {
  const scope = await resolveSessionScope(sessionId);
  if (!scope || scope.sessionId !== sessionId) throw new PromptQueueError('SESSION_NOT_FOUND', 404, 'Session scope is not available');
  return scope;
};
||||||| bc50ba56aa:packages/web/server/lib/message-queue/runtime.js
// Server-owned message queue: messages the user queued while a session was
// busy, delivered by the web server the moment the session goes idle. The
// queue lives here, not in the browser, so closing the tab, locking the phone,
// or losing the connection no longer strands what was queued. Structural
// template: permission-auto-accept (server-authoritative state, UI as a
// projection, VS Code keeps its own foreground implementation).
//
// Event-driven like session-goal: the shared upstream hub delivers
// `session.status`, and an idle transition arms a short per-session timer. The
// tick re-verifies idleness against OpenCode (status map + message tail) before
// it sends, because a queued prompt sent into a running turn would be steered
// into it instead of starting the next one.

import fs from 'fs';
import path from 'path';
import { createMessageId } from '../dispatch-results/runtime.js';
import { assertPromptResponse } from '../opencode/prompt-response.js';
import { unwrapOpenCodeResponse } from '../opencode/response-envelope.js';
import { createSessionActivityProbe } from '../opencode/session-activity.js';
import { attachmentHint } from '../routing/runtime.js';
import { buildGoalIntroText, createSessionGoal } from '../session-goal/create.js';

const QUEUE_FILE_NAME = 'message-queue.json';
const QUEUE_FILE_VERSION = 1;

const MAX_SESSIONS = 50;
const MAX_ITEMS_PER_SESSION = 20;
const CONTENT_CHAR_LIMIT = 200_000;

// Idle events arrive in bursts around a turn boundary; a short quiet window
// coalesces them before the tick verifies idleness against OpenCode.
const DISPATCH_QUIET_MS = 500;
// After a user abort the UI held the queue for two seconds so the stop is not
// immediately followed by the next prompt; the server keeps that window.
const ABORT_HOLD_MS = 2_000;
// While a background subagent keeps the turn open, how often the head is
// rechecked in case the parent's rerun idle event is missed.
const SUBAGENT_RECHECK_MS = 5_000;
const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_MAX_DELAY_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;
const MESSAGE_TAIL_LIMIT = 2;

const ATTACHMENT_SOURCES = new Set(['local', 'server', 'vscode']);
// Context captured with a queued message (see QueuedContextPart in the UI
// store): attached context items carry metadata the timeline renders back;
// the other kinds are plain synthetic text.
const CONTEXT_PART_KINDS = new Set(['context', 'instruction', 'synthetic']);
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;
const MESSAGE_ID_PATTERN = /^msg_[A-Za-z0-9]{8,64}$/;

const getQueuedSendRetryDelayMs = (failures) =>
  Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.max(failures - 1, 0), RETRY_MAX_DELAY_MS);

// Boundary readers: the only place raw JSON (client bodies, the queue file,
// OpenCode responses, hub events) is inspected. Everything below them
// branches on the domain values they return.
const asNonEmptyString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '');
const asText = (value) => (typeof value === 'string' ? value : '');
const asRecord = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);
const asList = (value) => (Array.isArray(value) ? value : null);
const asCount = (value) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : null);

const isValidSessionId = (value) => SESSION_ID_PATTERN.test(asNonEmptyString(value));

const httpError = (message, status) => Object.assign(new Error(message), { status });

const parseSendConfig = (value) => {
  const raw = asRecord(value);
  if (!raw) return null;
  const providerID = asNonEmptyString(raw.providerID);
  const modelID = asNonEmptyString(raw.modelID);
  if (!providerID || !modelID) return null;
  const sendConfig = { providerID, modelID };
  const agent = asNonEmptyString(raw.agent);
  if (agent) sendConfig.agent = agent;
  const variant = asNonEmptyString(raw.variant);
  if (variant) sendConfig.variant = variant;
  return sendConfig;
};
=======
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { isRecord, isString } from '../shared/object-guards.js';
import type { Application, Response as HttpResponse } from '../shared/http-contracts.js';
import type { GlobalMessageStreamHub, GlobalStreamEvent } from '../event-stream/global-hub.js';
import type { createSessionKnowledgeRuntime } from '../session-knowledge/runtime.js';
import type { createRoutingRuntime } from '../routing/runtime.js';
import type { ScheduledTaskProvenance, createExistingSessionTasks } from '../scheduled-tasks/existing-session.js';
import type { ScheduledTaskInput, ScheduledTaskStatus } from '../projects/contracts.js';
import type { RoutingModelRef } from '../routing/contracts.js';
import { createMessageId } from '../dispatch-results/runtime.js';
import { assertPromptResponse } from '../opencode/prompt-response.js';
import { unwrapOpenCodeResponse } from '../opencode/response-envelope.js';
import { attachmentHint } from '../routing/runtime.js';
import { buildGoalIntroText, createSessionGoal } from '../session-goal/create.js';

const QUEUE_FILE_NAME = 'message-queue.json';
const QUEUE_FILE_VERSION = 1;

const MAX_SESSIONS = 50;
const MAX_ITEMS_PER_SESSION = 20;
const CONTENT_CHAR_LIMIT = 200_000;

const DISPATCH_QUIET_MS = 500;
const ABORT_HOLD_MS = 2_000;
const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_MAX_DELAY_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;
const MESSAGE_TAIL_LIMIT = 2;

const ATTACHMENT_SOURCES = new Set(['local', 'server', 'vscode']);
const CONTEXT_PART_KINDS = new Set(['context', 'instruction', 'synthetic']);
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;
const MESSAGE_ID_PATTERN = /^msg_[A-Za-z0-9]{8,64}$/;

export interface QueueSendConfig {
  providerID?: string;
  modelID?: string;
  agent?: string;
  variant?: string;
}

export interface QueuedGoal {
  tokenBudget: number | null;
  objective?: string;
}

export interface QueuedAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  source: 'local' | 'server' | 'vscode';
  serverPath?: string;
  agentPath?: string;
  dataUrl: string;
}

export type QueuedContextPart =
  | { kind: 'context'; text: string; metadata: QueueRecord; instructions?: string }
  | { kind: 'instruction' | 'synthetic'; text: string; metadata?: never };

export interface QueuedItemInput {
  content: string;
  text: string;
  agentMention?: string;
  attachments: QueuedAttachment[];
  context: QueuedContextPart[];
  contextPreview?: string;
  sendConfig: QueueSendConfig;
  goal?: QueuedGoal;
  scheduledTask?: ScheduledTaskProvenance;
}

export interface QueuedItem extends QueuedItemInput {
  id: string;
  createdAt: number;
  syntheticIds?: string[];
}

export interface PublicQueuedItem extends Omit<QueuedItem, 'context' | 'syntheticIds' | 'attachments'> {
  attachments: Omit<QueuedAttachment, 'dataUrl'>[];
}

export interface SessionQueue {
  directory: string;
  items: QueuedItem[];
}

export interface MessageQueueOptions {
  globalEventHub: Pick<GlobalMessageStreamHub, 'subscribeEvent' | 'subscribeStatus'>;
  buildOpenCodeUrl: (route: string, query: string) => string | URL;
  getOpenCodeAuthHeaders: () => Record<string, string>;
  sessionKnowledgeRuntime?: Pick<ReturnType<typeof createSessionKnowledgeRuntime>, 'sync'> | null;
  broadcastGlobalUiEvent?: (event: { type: 'openchamber:message-queue.updated'; properties: { revision: number; session: MessageQueueSessionSnapshot } }) => void;
  onPromptSent?: (sessionId: string) => void;
  beforeScheduledTaskSend?: ReturnType<typeof createExistingSessionTasks>['beforeSend'];
  validateScheduledTaskTarget?: ReturnType<typeof createExistingSessionTasks>['validateTarget'];
  onScheduledTaskResult?: ReturnType<typeof createExistingSessionTasks>['result'];
  resolveAutoSelection?: ReturnType<typeof createRoutingRuntime>['resolveAutoSelection'] | null;
  persistSessionGoal?: Parameters<typeof createSessionGoal>[0]['persistSessionGoal'];
  isDeliveryHeld?: (sessionId: string) => boolean;
  deliveryHoldReady?: Promise<unknown>;
  dataDir: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  dispatchQuietMs?: number;
  abortHoldMs?: number;
  retryDelayMs?: (failures: number) => number;
}

export interface MessageQueueSessionSnapshot {
  sessionId: string;
  directory: string;
  items: PublicQueuedItem[];
  sendingId: string | null;
}

const getQueuedSendRetryDelayMs = (failures: number) =>
  Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.max(failures - 1, 0), RETRY_MAX_DELAY_MS);

const textSchema = z.unknown().transform((value) => isString(value) ? value : '');
const asNonEmptyString = z.unknown().transform((value) => isString(value) && value.trim() ? value.trim() : '').parse;
const asText = textSchema.parse;
const recordSchema = z.unknown().transform((value) => isRecord(value) ? value : null);
const asRecord = recordSchema.parse;
export type QueueRecord = NonNullable<z.output<typeof recordSchema>>;
const isList = (value: unknown): value is unknown[] => Array.isArray(value);
const listSchema = z.unknown().transform((value) => isList(value) ? value : null);
const asList = listSchema.parse;
const isFiniteNumber = (value: unknown): value is number => Number.isFinite(value);
const asCount = z.unknown().transform((value) => isFiniteNumber(value) && value >= 0 ? Math.floor(value) : null).parse;
const hasReadableFields = (value: unknown): value is { agent?: unknown; message?: unknown; status?: unknown; statusCode?: unknown } => value !== null && value !== undefined;
const isInteger = (value: unknown): value is number => Number.isInteger(value);
const hasQueueBody = (value: unknown): value is { item?: unknown; directory?: unknown; itemIds?: unknown } => value !== null && value !== undefined;
const hasScheduledTaskField = (value: unknown): value is { scheduledTask?: unknown } => value !== null && value !== undefined;
const isScheduledItem = (item: QueuedItem): item is QueuedItem & { scheduledTask: ScheduledTaskProvenance } => Boolean(item.scheduledTask);

interface QueueModel {
  id: string | undefined;
  providerID: string | undefined;
  variant?: string;
}

type PromptFile = {
  uri: string;
  name?: string;
};

interface CommandBody {
  name: string;
  text: string;
  files?: PromptFile[];
}

interface PromptBody {
  text: string;
  files?: PromptFile[];
  agents?: { name: string }[];
}

const hasSelectedModel = (model: QueueModel): model is QueueModel & RoutingModelRef => Boolean(model.providerID && model.id);

const isValidSessionId = (value: string | undefined): value is string => SESSION_ID_PATTERN.test(asNonEmptyString(value));

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

const sendConfigSchema = z.unknown().transform((value): QueueSendConfig | null => {
  const raw = asRecord(value);
  if (!raw) return null;
  const providerID = asNonEmptyString(raw.providerID);
  const modelID = asNonEmptyString(raw.modelID);
  if (!providerID || !modelID) return null;
  const sendConfig: QueueSendConfig = { providerID, modelID };
  const agent = asNonEmptyString(raw.agent);
  if (agent) sendConfig.agent = agent;
  const variant = asNonEmptyString(raw.variant);
  if (variant) sendConfig.variant = variant;
  return sendConfig;
});
const parseSendConfig = sendConfigSchema.parse;
>>>>>>> upstream/main:packages/web/server/lib/message-queue/runtime.ts

<<<<<<< HEAD:packages/web/server/lib/message-queue/runtime.js
const respondError = (res, error, fallback) => {
  const status = Number.isInteger(error?.status) ? error.status : (error?.name === 'ZodError' ? 400 : 500);
  const parsedCode = ProblemCodeSchema.safeParse(error?.code);
  const code = parsedCode.success ? parsedCode.data : status === 400 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR';
  const detail = error instanceof PromptQueueError ? error.message : fallback;
  const problem = ProblemDetailsSchema.parse({
    type: `urn:ohpichamber:problem:${code}`, title: detail, status, detail, code,
    retryable: status >= 500,
    ...(error instanceof PromptQueueError && error.details ? { details: error.details } : {}),
  });
  res.status(status).type('application/problem+json').json(problem);
};
||||||| bc50ba56aa:packages/web/server/lib/message-queue/runtime.js
// "Run as goal" captured with the message: `objective` only when the arming
// flow supplied its own (the plan flow), otherwise the delivered text is it.
const parseGoal = (value) => {
  if (value === undefined) return null;
  const raw = asRecord(value);
  if (!raw) throw new TypeError('invalid goal');
  const tokenBudget = raw.tokenBudget ?? null;
  if (tokenBudget !== null && !(Number.isInteger(tokenBudget) && tokenBudget > 0)) throw new TypeError('invalid goal tokenBudget');
  const goal = { tokenBudget };
  const objective = asNonEmptyString(raw.objective);
  if (objective) goal.objective = objective;
  return goal;
};
=======
const goalSchema = z.unknown().transform((value): QueuedGoal | null => {
  if (value === undefined) return null;
  const raw = asRecord(value);
  if (!raw) throw new TypeError('invalid goal');
  const tokenBudget = raw.tokenBudget ?? null;
  if (tokenBudget !== null && !(isInteger(tokenBudget) && tokenBudget > 0)) throw new TypeError('invalid goal tokenBudget');
  const goal: QueuedGoal = { tokenBudget };
  const objective = asNonEmptyString(raw.objective);
  if (objective) goal.objective = objective;
  return goal;
});
const parseGoal = goalSchema.parse;
>>>>>>> upstream/main:packages/web/server/lib/message-queue/runtime.ts

<<<<<<< HEAD:packages/web/server/lib/message-queue/runtime.js
const appendInput = (body) => {
  const { commandId, ...request } = body || {};
  return { commandId, request: QueueAppendRequestSchema.parse(request) };
};
||||||| bc50ba56aa:packages/web/server/lib/message-queue/runtime.js
const parseAttachment = (value) => {
  const raw = asRecord(value);
  if (!raw) return null;
  const filename = asNonEmptyString(raw.filename);
  const mimeType = asNonEmptyString(raw.mimeType);
  const dataUrl = asText(raw.dataUrl);
  if (!filename || !mimeType || !dataUrl) return null;
  const attachment = {
    id: asNonEmptyString(raw.id) || `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    filename,
    mimeType,
    size: asCount(raw.size) ?? 0,
    source: ATTACHMENT_SOURCES.has(raw.source) ? raw.source : 'local',
  };
  const serverPath = asNonEmptyString(raw.serverPath);
  if (serverPath) attachment.serverPath = serverPath;
  const agentPath = asNonEmptyString(raw.agentPath);
  if (agentPath) attachment.agentPath = agentPath;
  attachment.dataUrl = dataUrl;
  return attachment;
};
=======
const isAttachmentSource = (value: unknown): value is QueuedAttachment['source'] => isString(value) && ATTACHMENT_SOURCES.has(value);
const isContextKind = (value: unknown): value is QueuedContextPart['kind'] => isString(value) && CONTEXT_PART_KINDS.has(value);

const attachmentSchema = z.unknown().transform((value): QueuedAttachment | null => {
  const raw = asRecord(value);
  if (!raw) return null;
  const filename = asNonEmptyString(raw.filename);
  const mimeType = asNonEmptyString(raw.mimeType);
  const dataUrl = asText(raw.dataUrl);
  if (!filename || !mimeType || !dataUrl) return null;
  const attachment: Omit<QueuedAttachment, 'dataUrl'> = {
    id: asNonEmptyString(raw.id) || `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    filename,
    mimeType,
    size: asCount(raw.size) ?? 0,
    source: isAttachmentSource(raw.source) ? raw.source : 'local',
  };
  const serverPath = asNonEmptyString(raw.serverPath);
  if (serverPath) attachment.serverPath = serverPath;
  const agentPath = asNonEmptyString(raw.agentPath);
  if (agentPath) attachment.agentPath = agentPath;
  return Object.assign(attachment, { dataUrl });
});
const parseAttachment = attachmentSchema.parse;
>>>>>>> upstream/main:packages/web/server/lib/message-queue/runtime.ts

<<<<<<< HEAD:packages/web/server/lib/message-queue/runtime.js
const deleteInput = (body, queueItemId) => {
  const request = QueueDeleteRequestSchema.parse({ ...(body || {}), queueItemId });
  if (body?.queueItemId !== undefined && body.queueItemId !== queueItemId) {
    throw new PromptQueueError('INVALID_REQUEST', 400, 'Queue item identity must match its route');
  }
  return request;
};
||||||| bc50ba56aa:packages/web/server/lib/message-queue/runtime.js
const parseContextPart = (value) => {
  const raw = asRecord(value);
  if (!raw || !CONTEXT_PART_KINDS.has(raw.kind)) return null;
  const text = asText(raw.text);
  if (raw.kind !== 'context') return { kind: raw.kind, text };
  // The metadata is the UI's structured payload; the server only carries it
  // to the prompt, so its shape is the UI's to validate on the way back.
  const metadata = asRecord(raw.metadata);
  if (!metadata) return null;
  const part = { kind: 'context', text, metadata };
  const instructions = asNonEmptyString(raw.instructions);
  if (instructions) part.instructions = instructions;
  return part;
};
=======
const contextPartSchema = z.unknown().transform((value): QueuedContextPart | null => {
  const raw = asRecord(value);
  if (!raw || !isContextKind(raw.kind)) return null;
  const text = asText(raw.text);
  if (raw.kind !== 'context') return { kind: raw.kind, text };
  const metadata = asRecord(raw.metadata);
  if (!metadata) return null;
  const part: QueuedContextPart = { kind: 'context', text, metadata };
  const instructions = asNonEmptyString(raw.instructions);
  if (instructions) part.instructions = instructions;
  return part;
});
const parseContextPart = contextPartSchema.parse;
>>>>>>> upstream/main:packages/web/server/lib/message-queue/runtime.ts

<<<<<<< HEAD:packages/web/server/lib/message-queue/runtime.js
/**
 * Host product routes for the canonical queue. The request body is the
 * canonical QueueAppend/QueueReorder/Delete DTO; this layer never translates
 * OpenCode-shaped inputs or manufactures a model selection.
 */
export function registerMessageQueueRoutes(app, runtime, { resolveSessionScope, listQueueScopes } = {}) {
  if (typeof resolveSessionScope !== 'function') throw new TypeError('resolveSessionScope is required');
  if (typeof listQueueScopes !== 'function') throw new TypeError('listQueueScopes is required');
||||||| bc50ba56aa:packages/web/server/lib/message-queue/runtime.js
/**
 * Validates a queued item posted by a client. Throws a TypeError (→ 400) for
 * anything that could not be delivered later: a queue must never hold an item
 * the server cannot send.
 */
export const parseQueuedItemInput = (value) => {
  const raw = asRecord(value);
  if (!raw) throw new TypeError('item is required');
  const content = asText(raw.content).replace(/^\n+|\n+$/g, '');
  if (content.length > CONTENT_CHAR_LIMIT) throw new TypeError('item content is too long');
  const text = raw.text === undefined ? content : asText(raw.text);
  const attachments = (asList(raw.attachments) ?? []).map(parseAttachment);
  if (attachments.some((attachment) => attachment === null)) throw new TypeError('invalid attachment');
  const context = (asList(raw.context) ?? []).map(parseContextPart);
  if (context.some((part) => part === null)) throw new TypeError('invalid context part');
  if (!text.trim() && attachments.length === 0 && context.length === 0) {
    throw new TypeError('item needs text, attachments, or context');
  }
  const sendConfig = parseSendConfig(raw.sendConfig);
  const provenance = asRecord(raw.scheduledTask);
  const projectId = asNonEmptyString(provenance?.projectId);
  const taskId = asNonEmptyString(provenance?.taskId);
  if (provenance && (!projectId || !taskId)) throw new TypeError('invalid scheduledTask provenance');
  if (!sendConfig && !provenance) throw new TypeError('item sendConfig with providerID and modelID is required');
  const goal = parseGoal(raw.goal);
  if (goal && !text.trim()) throw new TypeError('a goal needs message text');
  const item = { content, text };
  const agentMention = asNonEmptyString(raw.agentMention);
  if (agentMention) item.agentMention = agentMention;
  item.attachments = attachments;
  item.context = context;
  const contextPreview = asNonEmptyString(raw.contextPreview).slice(0, 103);
  if (contextPreview) item.contextPreview = contextPreview;
  item.sendConfig = sendConfig ?? {};
  if (goal) item.goal = goal;
  if (provenance) {
    item.scheduledTask = { projectId, taskId };
    const agent = asNonEmptyString(raw.sendConfig?.agent);
    if (agent) item.sendConfig.agent = agent;
  }
  return item;
};

const parseStoredItem = (value) => {
  const raw = asRecord(value);
  const id = raw ? asNonEmptyString(raw.id) : '';
  if (!id) return null;
  try {
    const item = { id, createdAt: asCount(raw.createdAt) ?? Date.now(), ...parseQueuedItemInput(raw) };
    // Only the file carries these: a delivery mints them, a client never does.
    const syntheticIds = asList(raw.syntheticIds) ?? [];
    if (syntheticIds.length > 0 && syntheticIds.every((entry) => MESSAGE_ID_PATTERN.test(asText(entry)))) item.syntheticIds = syntheticIds;
    return item;
  } catch {
    return null;
  }
};

const toPublicAttachment = ({ dataUrl: _dataUrl, ...attachment }) => attachment;

// What clients see: everything except the payloads — attachment data URLs
// (megabytes of base64) and captured context (a PR diff, say) — which would
// otherwise ride every broadcast. A take hands the full item back.
const toPublicItem = (item) => {
  const publicItem = { id: item.id, createdAt: item.createdAt, content: item.content, text: item.text };
  if (item.agentMention) publicItem.agentMention = item.agentMention;
  publicItem.attachments = item.attachments.map(toPublicAttachment);
  // Older persisted items have no UI summary. Prefer their attached comment
  // before falling back to the model-facing context text.
  const contextPreview = item.contextPreview || item.context
    .filter((part) => part.kind !== 'instruction')
    .map((part) => asNonEmptyString(asRecord(part.metadata?.openchamberContext)?.text) || part.text.trim())
    .find(Boolean);
  if (contextPreview) {
    const firstLine = contextPreview.split('\n', 1)[0];
    publicItem.contextPreview = firstLine.slice(0, 100)
      + (contextPreview.length > firstLine.length || firstLine.length > 100 ? '...' : '');
  }
  publicItem.sendConfig = { ...item.sendConfig };
  if (item.goal) publicItem.goal = { ...item.goal };
  if (item.scheduledTask) publicItem.scheduledTask = { ...item.scheduledTask };
  return publicItem;
};

const extractSessionStatus = (payload) => {
  if (payload.type !== 'session.status') return null;
  const properties = asRecord(payload.properties) ?? {};
  const status = asRecord(properties.status) ?? {};
  const info = asRecord(properties.info) ?? {};
  const sessionId = asNonEmptyString(properties.sessionID);
  const type = asNonEmptyString(status.type) || asNonEmptyString(info.type);
  if (!sessionId || !type) return null;
  return { sessionId, type };
};

const extractAssistantMessageUpdate = (payload) => {
  if (payload.type !== 'message.updated') return null;
  const info = asRecord(asRecord(payload.properties)?.info);
  if (!info || info.role !== 'assistant') return null;
  const sessionId = asNonEmptyString(info.sessionID);
  if (!sessionId) return null;
  return {
    sessionId,
    completed: asCount(asRecord(info.time)?.completed) !== null,
  };
};

/**
 * A user abort no longer arrives as an assistant message carrying
 * `MessageAbortedError`: v2 reports `session.execution.interrupted`, which the
 * translator turns into `session.idle` with `aborted: true`.
 */
const extractAbortedSessionId = (payload) => {
  if (payload.type !== 'session.idle') return null;
  const properties = asRecord(payload.properties) ?? {};
  if (properties.aborted !== true) return null;
  return asNonEmptyString(properties.sessionID);
};

const extractDeletedSessionId = (payload) => {
  if (payload.type !== 'session.deleted') return null;
  const properties = asRecord(payload.properties) ?? {};
  return asNonEmptyString(asRecord(properties.info)?.id) || asNonEmptyString(properties.sessionID) || null;
};

export function createMessageQueueRuntime({
  globalEventHub,
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  sessionKnowledgeRuntime = null,
  broadcastGlobalUiEvent,
  onPromptSent,
  beforeScheduledTaskSend,
  validateScheduledTaskTarget,
  onScheduledTaskResult,
  // Resolves the `openchamber/auto` sentinel into a real model and agent right
  // before the send; absent means the queue never sees the sentinel.
  resolveAutoSelection = null,
  // Saves the goal record of a message queued as a goal (the session metadata store).
  persistSessionGoal = null,
  // True while something else drives the session (an auto-review run), which
  // calls `release` when it is done. `deliveryHoldReady` resolves once that
  // owner knows which sessions it holds; the first dispatch waits for it.
  isDeliveryHeld = () => false,
  deliveryHoldReady = Promise.resolve(),
  dataDir,
  fetchImpl = fetch,
  now = Date.now,
  dispatchQuietMs = DISPATCH_QUIET_MS,
  abortHoldMs = ABORT_HOLD_MS,
  retryDelayMs = getQueuedSendRetryDelayMs,
}) {
  const filePath = path.join(dataDir, QUEUE_FILE_NAME);

  /** sessionId → { directory, items } */
  const queues = new Map();
  let revision = 0;
  let loadPromise = null;
  let writePromise = Promise.resolve();
  let stopped = false;

  // An unfinished assistant message older than this marker is a run that died
  // with the previous server, not a streaming turn: no completion event will
  // ever arrive for it, so treating it as live strands restored queue items
  // forever. A run that outlived the restart (external OpenCode) is still
  // caught by the live status check, which runs first.
  const runtimeStartedAt = now();

  /** In-memory only — a restart has no in-flight sends. */
  const sending = new Map(); // sessionId → itemId
  const timers = new Map(); // sessionId → timeout
  const failures = new Map(); // sessionId → { itemId, failures, nextAttemptAt }
  const abortedAt = new Map(); // sessionId → timestamp
  // sessionId → directory, kept after the queue empties: the UI keys its
  // projection by directory, so the broadcast that removes the last item must
  // still name it or the client cannot tell which queue just finished.
  const directories = new Map();

  // --- persistence ---------------------------------------------------------

  const serialize = () => ({
    version: QUEUE_FILE_VERSION,
    revision,
    sessions: Object.fromEntries(
      Array.from(queues.entries()).map(([sessionId, queue]) => [sessionId, { directory: queue.directory, items: queue.items }]),
    ),
  });

  const readFile = async () => {
    let raw;
    try {
      raw = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      if (asRecord(error)?.code === 'ENOENT') return { sessions: {}, revision: 0 };
      throw error;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      // Malformed is a failure, not an empty queue: keep the bytes for the
      // user and start over rather than overwriting them on the next write.
      const backup = `${filePath}.corrupt-${now()}`;
      await fs.promises.rename(filePath, backup).catch(() => undefined);
      console.warn(`[message-queue] queue file was unreadable and moved to ${backup}: ${error?.message ?? error}`);
      return { sessions: {}, revision: 0 };
    }
    const stored = asRecord(parsed) ?? {};
    const sessions = {};
    for (const [sessionId, value] of Object.entries(asRecord(stored.sessions) ?? {})) {
      const entry = asRecord(value);
      if (!entry || !isValidSessionId(sessionId)) continue;
      const directory = asNonEmptyString(entry.directory);
      const items = (asList(entry.items) ?? []).map(parseStoredItem).filter(Boolean);
      if (!directory || items.length === 0) continue;
      sessions[sessionId] = { directory, items };
    }
    return { sessions, revision: asCount(stored.revision) ?? 0 };
  };

  const load = () => {
    if (!loadPromise) {
      loadPromise = readFile()
        .then((stored) => {
          for (const [sessionId, entry] of Object.entries(stored.sessions)) queues.set(sessionId, entry);
          revision = Math.max(revision, stored.revision);
        })
        .catch((error) => {
          // A read failure keeps the in-memory (empty) queue but must not be
          // mistaken for "nothing queued": the next write would clobber the
          // file, so writes stay disabled until a later load succeeds.
          loadPromise = null;
          throw error;
        });
    }
    return loadPromise;
  };

  const persist = () => {
    const payload = JSON.stringify(serialize());
    const write = writePromise.then(async () => {
      await fs.promises.mkdir(dataDir, { recursive: true });
      const tmpPath = `${filePath}.${process.pid}.tmp`;
      // Queued prompts are conversation content: readable by the owner only.
      await fs.promises.writeFile(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });
      await fs.promises.rename(tmpPath, filePath);
    });
    writePromise = write.catch((error) => {
      console.warn('[message-queue] failed to persist queue:', error?.message ?? error);
    });
    return write;
  };

  // --- snapshots -----------------------------------------------------------

  const sessionSnapshot = (sessionId) => {
    const queue = queues.get(sessionId);
    return {
      sessionId,
      directory: queue?.directory ?? directories.get(sessionId) ?? '',
      items: (queue?.items ?? []).map(toPublicItem),
      sendingId: sending.get(sessionId) ?? null,
    };
  };

  const snapshot = () => ({
    revision,
    sessions: Array.from(queues.keys()).map(sessionSnapshot),
  });

  const broadcast = (sessionId) => {
    broadcastGlobalUiEvent?.({
      type: 'openchamber:message-queue.updated',
      properties: { revision, session: sessionSnapshot(sessionId) },
    });
  };

  /** Every mutation goes through here: bump, persist, broadcast. */
  const commit = (sessionId) => {
    revision += 1;
    persist().catch(() => undefined);
    broadcast(sessionId);
    return { revision, session: sessionSnapshot(sessionId) };
  };

  const reportScheduledResult = (item, status, error) => {
    if (!item.scheduledTask) return;
    Promise.resolve().then(() => onScheduledTaskResult?.(item.scheduledTask, status, error))
      .catch((failure) => console.warn('[message-queue] scheduled task state write failed:', failure?.message ?? failure));
  };

  const setQueueItems = (sessionId, directory, items, status = 'cancelled', error) => {
    for (const item of queues.get(sessionId)?.items ?? []) {
      if (item.scheduledTask && !items.some((entry) => entry.id === item.id)) reportScheduledResult(item, status, error);
    }
    directories.set(sessionId, directory);
    if (items.length === 0) {
      queues.delete(sessionId);
      return;
    }
    queues.set(sessionId, { directory, items });
  };

  // --- OpenCode access -----------------------------------------------------

  const openCodeFetch = async (fetchPath, { directory, method = 'GET', body, query } = {}) => {
    const base = buildOpenCodeUrl(fetchPath, '');
    const params = new URLSearchParams(query || {});
    if (directory) params.set('directory', directory);
    const search = params.toString();
    const headers = { Accept: 'application/json', ...getOpenCodeAuthHeaders() };
    const init = { method, headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
    if (body) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const response = await fetchImpl(search ? `${base}?${search}` : base, init);
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw httpError(`OpenCode ${method} ${fetchPath} failed with ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`, response.status);
    }
    if (method === 'POST') {
      await assertPromptResponse(response, 'OpenCode dispatch');
    }
    return unwrapOpenCodeResponse(await response.json().catch(() => null));
  };

  /**
   * Live idleness, or null when it could not be established. Unknown is never
   * idle: a fetch failure re-arms instead of sending into a running turn.
   */
  const activityProbe = createSessionActivityProbe({ buildOpenCodeUrl, getOpenCodeAuthHeaders, timeoutMs: FETCH_TIMEOUT_MS, fetchImpl });

  /** True while a subagent of the session runs; null when it could not be checked. */
  const hasWorkingSubagents = async (sessionId) => {
    const statuses = await activityProbe.fetchActiveSessionStatuses();
    if (!statuses) return null;
    return activityProbe.hasWorkingDescendants(sessionId, statuses);
  };

  const isSessionIdle = async (sessionId, directory) => {
    // `/api/session/active` is global and lists only the sessions that are
    // running right now, so an absent entry means idle.
    // The route answers `{ data: { [id]: { type: 'running' } } }`; the shared
    // unwrap hands over the map, and an envelope is still accepted.
    const body = asRecord(await openCodeFetch('/api/session/active').catch(() => null));
    const statuses = asRecord(body && 'data' in body ? body.data : body);
    if (!statuses) return null;
    if (asRecord(statuses[sessionId])) return false;
    // A missed event leaves no entry while a turn still streams. The trailing
    // unfinished assistant message is the live evidence of that turn (mirrors
    // the UI gate). v2 lists messages newest first.
    const page = await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}/message`, {
      directory,
      query: { limit: String(MESSAGE_TAIL_LIMIT) },
    }).catch(() => null);
    const messages = asList(asRecord(page)?.data);
    if (!messages) return null;
    const last = asRecord(messages[0]);
    const lastTime = asRecord(last?.time);
    if (last?.type === 'assistant' && asCount(lastTime?.completed) === null) {
      const created = asCount(lastTime?.created);
      if (created === null || created >= runtimeStartedAt) return false;
      // Unfinished tail from before this runtime started: its run died with
      // the previous server, so it must not block delivery. (A missing
      // created timestamp stays conservative and blocks, as before.)
      console.log(`[message-queue] ignoring pre-boot unfinished tail for ${sessionId}`);
    }
    return true;
  };

  const resolveSlashCommand = async (text, directory) => {
    if (!text.startsWith('/')) return null;
    const [head, ...tail] = text.split(' ');
    const name = head.slice(1);
    if (!name) return null;
    const commands = asList(await openCodeFetch('/api/command', { directory })) ?? [];
    const match = commands.map(asRecord).find((command) => command?.name === name);
    if (!match) return null;
    return {
      name,
      arguments: tail.join(' '),
    };
  };

  // v2 takes prompt attachments as URIs; a data URL is one.
  const toPromptFile = (attachment) => ({
    uri: attachment.dataUrl,
    ...(attachment.agentPath || attachment.filename ? { name: attachment.agentPath || attachment.filename } : {}),
  });

  /**
   * Captured context travels as synthetic messages in v2 — the composer's
   * inline `synthetic: true` text parts are gone. One message per entry, an
   * attached item's metadata riding along, and its reading instructions (a
   * linked PR) going first.
   */
  const toContextMessages = (part) => {
    const body = { text: part.text, resume: false };
    if (part.kind !== 'context') return [body];
    const withMetadata = part.metadata ? { ...body, metadata: part.metadata } : body;
    return part.instructions
      ? [{ text: part.instructions, resume: false }, withMetadata]
      : [withMetadata];
  };

  /**
   * Gives what an item admits ahead of its message stable ids, saved before the
   * first attempt: a retry, also after a restart, reuses them and OpenCode keeps
   * the first admission. They end one millisecond apart at the mint time, so
   * they sort in admission order and ahead of the message, whose id OpenCode
   * assigns later.
   */
  const ensureSyntheticIds = async (item, count) => {
    if (item.syntheticIds?.length === count) return;
    const firstAt = now() - count + 1;
    item.syntheticIds = Array.from({ length: count }, (_, index) => createMessageId(firstAt + index));
    try {
      await persist();
    } catch (error) {
      // Unsaved, a crash would mint them again and admit everything twice.
      delete item.syntheticIds;
      throw error;
    }
  };

  const sendItem = async (sessionId, directory, item) => {
    const { providerID, modelID, variant } = item.sendConfig;
    let agent = item.sendConfig.agent;
    let model = { id: modelID, providerID, ...(variant ? { variant } : {}) };
    const promptFiles = item.attachments.map(toPromptFile);
    // The goal briefing goes last, right before the message the goal is about.
    const synthetics = [
      ...item.context.flatMap(toContextMessages),
      ...(item.goal ? [{ text: buildGoalIntroText(item.goal.tokenBudget), resume: false }] : []),
    ];

    // Jev routing, when the queued send named the Auto sentinel. A failure
    // inside resolves to the fallback model; only a missing fallback throws.
    const routed = providerID && modelID ? await resolveAutoSelection?.({
      sessionId,
      directory,
      model,
      agent,
      requestText: `${item.text}${attachmentHint({ files: promptFiles })}`.trim(),
    }) : null;
    if (routed) {
      model = routed.model;
      agent = routed.agent ?? agent;
    }

    // v2 selects model and agent on the session, not per prompt: the choice is
    // switched once and then persists.
    if (!item.scheduledTask || (providerID && modelID)) await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}/model`, {
      directory,
      method: 'POST',
      body: { model },
    });
    if (agent) {
      await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}/agent`, {
        directory,
        method: 'POST',
        body: { agent },
      });
    }

    // Resolved before anything is admitted: a failed command lookup fails the
    // whole send with nothing in the session.
    const command = await resolveSlashCommand(item.text, directory);

    // Standing project context is written into the session first, exactly as
    // a UI send does it; a failed write sends without it rather than not at all.
    // The response style is left out: a queued message is the user's own, and
    // this server delivery has no style text of its own, so the entry the
    // session already holds stays as it is.
    if (sessionKnowledgeRuntime) await sessionKnowledgeRuntime.sync(sessionId, directory);

    // OpenCode's commit of a staged revert deletes everything admitted past the
    // revert's boundary, so a staged revert is committed before the first
    // synthetic message, and before the goal save so a failure here leaves no
    // goal behind. A plain prompt leaves the commit to OpenCode, as a UI send does.
    if (synthetics.length > 0) {
      await ensureSyntheticIds(item, synthetics.length);
      const session = asRecord(await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}`, { directory }));
      if (!session) throw new Error(`OpenCode returned no record for session ${sessionId}`);
      if (session.revert) {
        await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}/revert/commit`, { directory, method: 'POST' });
      }
    }

    // A message queued as a goal starts it now, as a direct send would. The
    // goal is saved before anything is admitted, so a failed save leaves
    // nothing in the session for the retry to duplicate.
    if (item.goal) {
      await createSessionGoal({
        persistSessionGoal,
        sessionID: sessionId,
        directory,
        objective: item.goal.objective || item.text,
        tokenBudget: item.goal.tokenBudget,
        providerID: model.providerID,
        modelID: model.id,
        onWarning: (message, error) => console.warn(`[message-queue] ${message}:`, error?.message || error),
      });
    }

    // Same order as a UI send: everything attached to the message is admitted
    // before the message itself, so the model reads it as background. This
    // holds for a command too: its route takes file attachments only, and
    // sending "/name args" as a prompt instead would skip the template
    // OpenCode 2.x expands only on the command route.
    for (const [index, synthetic] of synthetics.entries()) {
      await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}/synthetic`, {
        directory,
        method: 'POST',
        body: { id: item.syntheticIds[index], ...synthetic },
      });
    }

    if (command) {
      await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}/command`, {
        directory,
        method: 'POST',
        body: {
          // OpenCode 2.0.8 renamed the command body field `command` to `name`.
          name: command.name,
          text: command.arguments,
          ...(promptFiles.length > 0 ? { files: promptFiles } : {}),
        },
      });
    } else {
      await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}/prompt`, {
        directory,
        method: 'POST',
        body: {
          text: item.text,
          ...(promptFiles.length > 0 ? { files: promptFiles } : {}),
          ...(item.agentMention ? { agents: [{ name: item.agentMention }] } : {}),
        },
      });
    }
  };

  // --- dispatch loop -------------------------------------------------------

  const clearTimer = (sessionId) => {
    const existing = timers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      timers.delete(sessionId);
    }
  };

  const armDispatch = (sessionId, delayMs = dispatchQuietMs) => {
    if (stopped || !queues.has(sessionId)) return;
    clearTimer(sessionId);
    const timer = setTimeout(() => {
      timers.delete(sessionId);
      tick(sessionId).catch((error) => {
        console.warn('[message-queue] dispatch tick failed:', error?.message ?? error);
      });
    }, Math.max(0, delayMs));
    timer.unref?.();
    timers.set(sessionId, timer);
  };

  async function tick(sessionId) {
    if (stopped) return;
    const queue = queues.get(sessionId);
    if (!queue || queue.items.length === 0 || sending.has(sessionId) || isDeliveryHeld(sessionId)) return;

    const abortHoldUntil = (abortedAt.get(sessionId) ?? 0) + abortHoldMs;
    if (abortHoldUntil > now()) {
      armDispatch(sessionId, abortHoldUntil - now());
      return;
    }

    const head = queue.items[0];
    const failure = failures.get(sessionId);
    if (failure && failure.itemId !== head.id) failures.delete(sessionId);
    else if (failure && failure.nextAttemptAt > now()) {
      armDispatch(sessionId, failure.nextAttemptAt - now());
      return;
    }

    const idle = await isSessionIdle(sessionId, queue.directory);
    if (idle === null) {
      if (head.scheduledTask && validateScheduledTaskTarget) {
        try {
          await validateScheduledTaskTarget(head.scheduledTask.projectId, sessionId);
        } catch (error) {
          if (error?.statusCode === 404 || error?.statusCode === 409) {
            const after = queues.get(sessionId);
            if (after) setQueueItems(sessionId, after.directory, after.items.filter((entry) => entry.id !== head.id), 'failed', error.message);
            commit(sessionId);
            armDispatch(sessionId);
            return;
          }
        }
      }
      armDispatch(sessionId, retryDelayMs(1));
      return;
    }
    // Busy: the next idle status event re-arms the loop.
    if (!idle) return;

    // A queued message waits for the whole turn. A parent idles while a
    // background subagent works and runs again when OpenCode hands the
    // result back, so the turn is only over once no subagent runs. That rerun
    // re-arms through its idle event; the recheck covers a missed one.
    const subagentsWorking = await hasWorkingSubagents(sessionId);
    if (subagentsWorking !== false) {
      armDispatch(sessionId, subagentsWorking === null ? retryDelayMs(1) : SUBAGENT_RECHECK_MS);
      return;
    }

    // Re-read after the awaits — the user may have edited the queue meanwhile.
    const current = queues.get(sessionId);
    const item = current?.items[0];
    if (!item || item.id !== head.id || sending.has(sessionId)) return;

    sending.set(sessionId, item.id);
    broadcast(sessionId);
    try {
      if (item.scheduledTask) {
        try {
          await beforeScheduledTaskSend?.(sessionId, current.directory, item);
        } catch (error) {
          if (error?.statusCode !== 404 && error?.statusCode !== 409) throw error;
          sending.delete(sessionId);
          const after = queues.get(sessionId);
          if (after) setQueueItems(sessionId, after.directory, after.items.filter((entry) => entry.id !== item.id), 'failed', error.message);
          failures.delete(sessionId);
          commit(sessionId);
          armDispatch(sessionId);
          return;
        }
      }
      await sendItem(sessionId, current.directory, item);
      const after = queues.get(sessionId);
      if (after) setQueueItems(sessionId, after.directory, after.items.filter((entry) => entry.id !== item.id), 'sent');
      failures.delete(sessionId);
      sending.delete(sessionId);
      commit(sessionId);
      try {
        onPromptSent?.(sessionId);
      } catch {
        // bookkeeping only
      }
      console.log(`[message-queue] sent queued message to ${sessionId}`);
    } catch (error) {
      sending.delete(sessionId);
      const count = (failure?.itemId === item.id ? failure.failures : 0) + 1;
      const nextAttemptAt = now() + retryDelayMs(count);
      failures.set(sessionId, { itemId: item.id, failures: count, nextAttemptAt });
      console.warn(`[message-queue] send to ${sessionId} failed (attempt ${count}):`, error?.message ?? error);
      broadcast(sessionId);
      armDispatch(sessionId, nextAttemptAt - now());
    }
  }

  const reconcileAll = () => {
    for (const sessionId of queues.keys()) {
      if (!timers.has(sessionId)) armDispatch(sessionId, dispatchQuietMs);
    }
  };

  // --- public mutations ----------------------------------------------------

  const requireSessionId = (sessionId) => {
    if (!isValidSessionId(sessionId)) throw new TypeError('sessionId is invalid');
    return sessionId;
  };

  const enqueue = async (sessionIdInput, directoryInput, itemInput) => {
    const sessionId = requireSessionId(sessionIdInput);
    const directory = asNonEmptyString(directoryInput);
    if (!directory) throw new TypeError('directory is required');
    const parsed = parseQueuedItemInput(itemInput);
    await load();
    if (parsed.scheduledTask) {
      for (const queue of queues.values()) {
        if (queue.items.some((entry) => entry.scheduledTask?.projectId === parsed.scheduledTask.projectId && entry.scheduledTask.taskId === parsed.scheduledTask.taskId)) {
          throw httpError('task is already queued', 409);
        }
      }
      if ((queues.get(sessionId)?.items.length ?? 0) >= MAX_ITEMS_PER_SESSION || (!queues.has(sessionId) && queues.size >= MAX_SESSIONS)) {
        throw httpError('message queue is full', 409);
      }
    }
    const item = {
      id: `queued-${now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: now(),
      ...parsed,
    };
    const existing = queues.get(sessionId);
    const items = [...(existing?.items ?? []), item].slice(-MAX_ITEMS_PER_SESSION);
    setQueueItems(sessionId, directory, items);
    directories.set(sessionId, directory);
    if (queues.size > MAX_SESSIONS) {
      const oldest = Array.from(queues.entries())
        .filter(([id]) => id !== sessionId && !sending.has(id))
        .sort((left, right) => (left[1].items[0]?.createdAt ?? 0) - (right[1].items[0]?.createdAt ?? 0))
        .slice(0, queues.size - MAX_SESSIONS);
      for (const [staleId] of oldest) {
        setQueueItems(staleId, directories.get(staleId), []);
        clearTimer(staleId);
        broadcast(staleId);
        directories.delete(staleId);
      }
    }
    const result = commit(sessionId);
    // The session may already be idle (queued from a busy-looking composer
    // right as the turn ended); the tick verifies before sending.
    armDispatch(sessionId);
    return { ...result, itemId: item.id };
  };

  const remove = async (sessionIdInput, itemId) => {
    const sessionId = requireSessionId(sessionIdInput);
    await load();
    if (sending.get(sessionId) === itemId) throw httpError('message is being sent', 409);
    const queue = queues.get(sessionId);
    if (!queue || !queue.items.some((item) => item.id === itemId)) {
      return { revision, session: sessionSnapshot(sessionId) };
    }
    setQueueItems(sessionId, queue.directory, queue.items.filter((item) => item.id !== itemId));
    return commit(sessionId);
  };

  /** Removes the item and hands its full payload (attachments included) back. */
  const take = async (sessionIdInput, itemId) => {
    const sessionId = requireSessionId(sessionIdInput);
    await load();
    if (sending.get(sessionId) === itemId) throw httpError('message is being sent', 409);
    const queue = queues.get(sessionId);
    const item = queue?.items.find((entry) => entry.id === itemId);
    if (!queue || !item) throw httpError('queued message not found', 404);
    if (item.scheduledTask) throw httpError('scheduled messages cannot be taken', 409);
    setQueueItems(sessionId, queue.directory, queue.items.filter((entry) => entry.id !== itemId));
    return { ...commit(sessionId), item };
  };

  /** Removes every item not currently being sent and hands them back in order. */
  const takeAll = async (sessionIdInput) => {
    const sessionId = requireSessionId(sessionIdInput);
    await load();
    const queue = queues.get(sessionId);
    if (!queue) return { revision, session: sessionSnapshot(sessionId), items: [] };
    const sendingId = sending.get(sessionId) ?? null;
    const items = queue.items.filter((item) => item.id !== sendingId && !item.scheduledTask);
    if (items.length === 0) return { revision, session: sessionSnapshot(sessionId), items: [] };
    setQueueItems(sessionId, queue.directory, queue.items.filter((item) => item.id === sendingId || item.scheduledTask));
    return { ...commit(sessionId), items };
  };

  const reorder = async (sessionIdInput, itemIds) => {
    const sessionId = requireSessionId(sessionIdInput);
    if (!asList(itemIds) || itemIds.some((id) => !asNonEmptyString(id))) {
      throw new TypeError('itemIds must be a list of ids');
    }
    await load();
    const queue = queues.get(sessionId);
    if (!queue) return { revision, session: sessionSnapshot(sessionId) };
    const byId = new Map(queue.items.map((item) => [item.id, item]));
    if (itemIds.length !== byId.size || new Set(itemIds).size !== itemIds.length || itemIds.some((id) => !byId.has(id))) {
      throw new TypeError('itemIds must list every queued message exactly once');
    }
    queues.set(sessionId, { directory: queue.directory, items: itemIds.map((id) => byId.get(id)) });
    return commit(sessionId);
  };

  const clear = async (sessionIdInput) => {
    const sessionId = requireSessionId(sessionIdInput);
    await load();
    const queue = queues.get(sessionId);
    if (!queue) return { revision, session: sessionSnapshot(sessionId) };
    // Never drop a message already handed to OpenCode: its send resolves and
    // must find its entry.
    const sendingId = sending.get(sessionId) ?? null;
    setQueueItems(sessionId, queue.directory, queue.items.filter((item) => item.id === sendingId));
    clearTimer(sessionId);
    return commit(sessionId);
  };

  /** What held the session's delivery let go: deliver whatever waited. */
  const release = (sessionId) => {
    armDispatch(sessionId);
  };

  // --- events --------------------------------------------------------------

  const processPayload = (value) => {
    const payload = asRecord(value);
    if (stopped || !payload) return;

    const deletedSessionId = extractDeletedSessionId(payload);
    if (deletedSessionId) {
      if (!queues.has(deletedSessionId)) return;
      setQueueItems(deletedSessionId, directories.get(deletedSessionId), []);
      clearTimer(deletedSessionId);
      failures.delete(deletedSessionId);
      commit(deletedSessionId);
      directories.delete(deletedSessionId);
      return;
    }

    const status = extractSessionStatus(payload);
    if (status) {
      if (!queues.has(status.sessionId)) return;
      if (status.type === 'idle') armDispatch(status.sessionId);
      else clearTimer(status.sessionId);
      return;
    }

    const abortedSessionId = extractAbortedSessionId(payload);
    if (abortedSessionId) {
      if (queues.has(abortedSessionId)) abortedAt.set(abortedSessionId, now());
      return;
    }

    const assistant = extractAssistantMessageUpdate(payload);
    if (assistant && queues.has(assistant.sessionId)) {
      // A completed reply without a following idle status (missed event)
      // must still drain the queue; the tick verifies idleness itself.
      if (assistant.completed && !timers.has(assistant.sessionId)) armDispatch(assistant.sessionId);
    }
  };

  const processEvent = (event) => {
    // The hub translates v2 wire events into the server's vocabulary once.
    for (const payload of event?.translated?.() ?? []) processPayload(payload);
  };

  const start = () => {
    const unsubscribeEvent = globalEventHub.subscribeEvent(processEvent);
    const unsubscribeStatus = globalEventHub.subscribeStatus((status) => {
      if (status?.type === 'connect') reconcileAll();
    });
    void load()
      .then(async () => {
        if (queues.size > 0) console.log(`[message-queue] restored queues for ${queues.size} session(s)`);
        // A tick that ran before this saw every session held and armed nothing.
        await deliveryHoldReady;
        reconcileAll();
      })
      .catch((error) => {
        console.warn('[message-queue] failed to load queue file:', error?.message ?? error);
      });
    return () => {
      unsubscribeEvent();
      unsubscribeStatus();
    };
  };

  const stop = () => {
    stopped = true;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };

  const cancelScheduledTask = async (projectId, taskId) => {
    await load();
    for (const [sessionId, queue] of queues) {
      const items = queue.items.filter((item) => item.scheduledTask?.projectId !== projectId || item.scheduledTask.taskId !== taskId || sending.get(sessionId) === item.id);
      if (items.length === queue.items.length) continue;
      setQueueItems(sessionId, queue.directory, items);
      commit(sessionId);
      armDispatch(sessionId);
    }
  };

  return {
    load,
    snapshot,
    sessionSnapshot,
    enqueue,
    cancelScheduledTask,
    remove,
    take,
    takeAll,
    reorder,
    clear,
    release,
    processPayload,
    start,
    stop,
    /** Drains the pending write; tests and shutdown use it. */
    flush: () => writePromise,
  };
}

export function registerMessageQueueRoutes(app, runtime) {
  const respondError = (res, error, fallback) => {
    const status = error instanceof TypeError ? 400 : (Number.isInteger(error?.status) ? error.status : 500);
    res.status(status).json({ error: error?.message ?? fallback });
  };
=======
const queuedItemInputSchema = z.unknown().transform((value): QueuedItemInput => {
  const raw = asRecord(value);
  if (!raw) throw new TypeError('item is required');
  const content = asText(raw.content).replace(/^\n+|\n+$/g, '');
  if (content.length > CONTENT_CHAR_LIMIT) throw new TypeError('item content is too long');
  const text = raw.text === undefined ? content : asText(raw.text);
  const attachments = (asList(raw.attachments) ?? []).map((entry) => parseAttachment(entry));
  if (!attachments.every((attachment) => attachment !== null)) throw new TypeError('invalid attachment');
  const context = (asList(raw.context) ?? []).map((entry) => parseContextPart(entry));
  if (!context.every((part) => part !== null)) throw new TypeError('invalid context part');
  if (!text.trim() && attachments.length === 0 && context.length === 0) {
    throw new TypeError('item needs text, attachments, or context');
  }
  const sendConfig = parseSendConfig(raw.sendConfig);
  const provenance = asRecord(raw.scheduledTask);
  const projectId = asNonEmptyString(provenance?.projectId);
  const taskId = asNonEmptyString(provenance?.taskId);
  if (provenance && (!projectId || !taskId)) throw new TypeError('invalid scheduledTask provenance');
  if (!sendConfig && !provenance) throw new TypeError('item sendConfig with providerID and modelID is required');
  const goal = parseGoal(raw.goal);
  if (goal && !text.trim()) throw new TypeError('a goal needs message text');
  const item: Omit<QueuedItemInput, 'attachments' | 'context' | 'sendConfig'> & Partial<Pick<QueuedItemInput, 'attachments' | 'context' | 'sendConfig'>> = { content, text };
  const agentMention = asNonEmptyString(raw.agentMention);
  if (agentMention) item.agentMention = agentMention;
  item.attachments = attachments;
  item.context = context;
  const contextPreview = asNonEmptyString(raw.contextPreview).slice(0, 103);
  if (contextPreview) item.contextPreview = contextPreview;
  item.sendConfig = sendConfig ?? {};
  if (goal) item.goal = goal;
  if (provenance) {
    item.scheduledTask = { projectId, taskId };
    const agent = asNonEmptyString(hasReadableFields(raw.sendConfig) ? raw.sendConfig.agent : undefined);
    if (agent) item.sendConfig.agent = agent;
  }
  return Object.assign(item, { attachments: item.attachments, context: item.context, sendConfig: item.sendConfig });
});
export const parseQueuedItemInput = queuedItemInputSchema.parse;

const storedItemSchema = z.unknown().transform((value): QueuedItem | null => {
  const raw = asRecord(value);
  const id = raw ? asNonEmptyString(raw.id) : '';
  if (!raw || !id) return null;
  try {
    const item: QueuedItem = { id, createdAt: asCount(raw.createdAt) ?? Date.now(), ...parseQueuedItemInput(raw) };
    const syntheticIds = asList(raw.syntheticIds) ?? [];
    if (syntheticIds.length > 0 && syntheticIds.every((entry): entry is string => MESSAGE_ID_PATTERN.test(asText(entry)))) item.syntheticIds = syntheticIds;
    return item;
  } catch {
    return null;
  }
});
const parseStoredItem = storedItemSchema.parse;

const toPublicAttachment = ({ dataUrl: _dataUrl, ...attachment }: QueuedAttachment) => attachment;

const toPublicItem = (item: QueuedItem) => {
  const publicItem: Omit<PublicQueuedItem, 'attachments' | 'sendConfig'> & Partial<Pick<PublicQueuedItem, 'attachments' | 'sendConfig'>> = { id: item.id, createdAt: item.createdAt, content: item.content, text: item.text };
  if (item.agentMention) publicItem.agentMention = item.agentMention;
  publicItem.attachments = item.attachments.map(toPublicAttachment);
  const contextPreview = item.contextPreview || item.context
    .filter((part) => part.kind !== 'instruction')
    .map((part) => asNonEmptyString(asRecord(part.metadata?.openchamberContext)?.text) || part.text.trim())
    .find(Boolean);
  if (contextPreview) {
    const [firstLine = ''] = contextPreview.split('\n', 1);
    publicItem.contextPreview = firstLine.slice(0, 100)
      + (contextPreview.length > firstLine.length || firstLine.length > 100 ? '...' : '');
  }
  publicItem.sendConfig = { ...item.sendConfig };
  if (item.goal) publicItem.goal = { ...item.goal };
  if (item.scheduledTask) publicItem.scheduledTask = { ...item.scheduledTask };
  return Object.assign(publicItem, { attachments: publicItem.attachments, sendConfig: publicItem.sendConfig });
};

const extractSessionStatus = (payload: QueueRecord) => {
  if (payload.type !== 'session.status') return null;
  const properties = asRecord(payload.properties) ?? {};
  const status = asRecord(properties.status) ?? {};
  const info = asRecord(properties.info) ?? {};
  const sessionId = asNonEmptyString(properties.sessionID);
  const type = asNonEmptyString(status.type) || asNonEmptyString(info.type);
  if (!sessionId || !type) return null;
  return { sessionId, type };
};

const extractAssistantMessageUpdate = (payload: QueueRecord) => {
  if (payload.type !== 'message.updated') return null;
  const info = asRecord(asRecord(payload.properties)?.info);
  if (!info || info.role !== 'assistant') return null;
  const sessionId = asNonEmptyString(info.sessionID);
  if (!sessionId) return null;
  return {
    sessionId,
    completed: asCount(asRecord(info.time)?.completed) !== null,
  };
};

const extractAbortedSessionId = (payload: QueueRecord) => {
  if (payload.type !== 'session.idle') return null;
  const properties = asRecord(payload.properties) ?? {};
  if (properties.aborted !== true) return null;
  return asNonEmptyString(properties.sessionID);
};

const extractDeletedSessionId = (payload: QueueRecord) => {
  if (payload.type !== 'session.deleted') return null;
  const properties = asRecord(payload.properties) ?? {};
  return asNonEmptyString(asRecord(properties.info)?.id) || asNonEmptyString(properties.sessionID) || null;
};

const extractSessionDirectoryUpdate = (payload: QueueRecord) => {
  if (payload.type !== 'session.updated') return null;
  const properties = asRecord(payload.properties) ?? {};
  const info = asRecord(properties.info) ?? {};
  const sessionId = asNonEmptyString(info.id) || asNonEmptyString(properties.sessionID);
  const directory = asNonEmptyString(info.directory);
  const projectID = asNonEmptyString(info.projectID);
  return sessionId && directory && projectID ? { sessionId, directory } : null;
};

export function createMessageQueueRuntime({
  globalEventHub,
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  sessionKnowledgeRuntime = null,
  broadcastGlobalUiEvent,
  onPromptSent,
  beforeScheduledTaskSend,
  validateScheduledTaskTarget,
  onScheduledTaskResult,
  resolveAutoSelection = null,
  persistSessionGoal = null,
  isDeliveryHeld = () => false,
  deliveryHoldReady = Promise.resolve(),
  dataDir,
  fetchImpl = fetch,
  now = Date.now,
  dispatchQuietMs = DISPATCH_QUIET_MS,
  abortHoldMs = ABORT_HOLD_MS,
  retryDelayMs = getQueuedSendRetryDelayMs,
}: MessageQueueOptions) {
  const filePath = path.join(dataDir, QUEUE_FILE_NAME);

  const queues = new Map<string, SessionQueue>();
  let revision = 0;
  let loadPromise: Promise<void> | null = null;
  let writePromise = Promise.resolve();
  let stopped = false;

  const runtimeStartedAt = now();

  const sending = new Map<string, string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const failures = new Map<string, { itemId: string; failures: number; nextAttemptAt: number }>();
  const abortedAt = new Map<string, number>();
  const directories = new Map<string, string | undefined>();

  const serialize = () => ({
    version: QUEUE_FILE_VERSION,
    revision,
    sessions: Object.fromEntries(
      Array.from(queues.entries()).map(([sessionId, queue]) => [sessionId, { directory: queue.directory, items: queue.items }]),
    ),
  });

  const readFile = async () => {
    let raw;
    try {
      raw = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      if (asRecord(error)?.code === 'ENOENT') return { sessions: {}, revision: 0 };
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const backup = `${filePath}.corrupt-${now()}`;
      await fs.promises.rename(filePath, backup).catch(() => undefined);
      console.warn(`[message-queue] queue file was unreadable and moved to ${backup}: ${(hasReadableFields(error) ? error.message : undefined) ?? error}`);
      return { sessions: {}, revision: 0 };
    }
    const stored = asRecord(parsed) ?? {};
    const sessions: Record<string, SessionQueue> = {};
    for (const [sessionId, value] of Object.entries(asRecord(stored.sessions) ?? {})) {
      const entry = asRecord(value);
      if (!entry || !isValidSessionId(sessionId)) continue;
      const directory = asNonEmptyString(entry.directory);
      const items = (asList(entry.items) ?? []).map((entry) => parseStoredItem(entry)).filter((item) => item !== null);
      if (!directory || items.length === 0) continue;
      sessions[sessionId] = { directory, items };
    }
    return { sessions, revision: asCount(stored.revision) ?? 0 };
  };

  const load = () => {
    if (!loadPromise) {
      loadPromise = readFile()
        .then((stored) => {
          for (const [sessionId, entry] of Object.entries(stored.sessions)) queues.set(sessionId, entry);
          revision = Math.max(revision, stored.revision);
        })
        .catch((error) => {
          loadPromise = null;
          throw error;
        });
    }
    return loadPromise;
  };

  const persist = () => {
    const payload = JSON.stringify(serialize());
    const write = writePromise.then(async () => {
      await fs.promises.mkdir(dataDir, { recursive: true });
      const tmpPath = `${filePath}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });
      await fs.promises.rename(tmpPath, filePath);
    });
    writePromise = write.catch((error) => {
      console.warn('[message-queue] failed to persist queue:', error?.message ?? error);
    });
    return write;
  };

  const sessionSnapshot = (sessionId: string): MessageQueueSessionSnapshot => {
    const queue = queues.get(sessionId);
    return {
      sessionId,
      directory: queue?.directory ?? directories.get(sessionId) ?? '',
      items: (queue?.items ?? []).map(toPublicItem),
      sendingId: sending.get(sessionId) ?? null,
    };
  };

  const snapshot = () => ({
    revision,
    sessions: Array.from(queues.keys()).map(sessionSnapshot),
  });

  const broadcast = (sessionId: string) => {
    broadcastGlobalUiEvent?.({
      type: 'openchamber:message-queue.updated',
      properties: { revision, session: sessionSnapshot(sessionId) },
    });
  };

  const commit = (sessionId: string) => {
    revision += 1;
    persist().catch(() => undefined);
    broadcast(sessionId);
    return { revision, session: sessionSnapshot(sessionId) };
  };

  const reportScheduledResult = (item: QueuedItem, status: ScheduledTaskStatus, cause?: unknown) => {
    if (!isScheduledItem(item)) return;
    Promise.resolve().then(() => onScheduledTaskResult?.(item.scheduledTask, status, cause))
      .catch((failure) => console.warn('[message-queue] scheduled task state write failed:', failure?.message ?? failure));
  };

  const setQueueItems = (sessionId: string, directory: string | undefined, items: QueuedItem[], status: ScheduledTaskStatus = 'cancelled', cause?: unknown) => {
    for (const item of queues.get(sessionId)?.items ?? []) {
      if (item.scheduledTask && !items.some((entry) => entry.id === item.id)) reportScheduledResult(item, status, cause);
    }
    directories.set(sessionId, directory);
    if (items.length === 0) {
      queues.delete(sessionId);
      return;
    }
    if (directory === undefined) throw new Error('Message queue directory is missing');
    queues.set(sessionId, { directory, items });
  };

  const openCodeFetch = async (fetchPath: string, { directory, method = 'GET', body, query }: { directory?: string | undefined; method?: string; body?: object; query?: Record<string, string> } = {}) => {
    const base = buildOpenCodeUrl(fetchPath, '');
    const params = new URLSearchParams(query || {});
    if (directory) params.set('directory', directory);
    const search = params.toString();
    const headers: ReturnType<MessageQueueOptions['getOpenCodeAuthHeaders']> = { Accept: 'application/json', ...getOpenCodeAuthHeaders() };
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
    if (body) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const response = await fetchImpl(search ? `${base}?${search}` : base, init);
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw httpError(`OpenCode ${method} ${fetchPath} failed with ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`, response.status);
    }
    if (method === 'POST') {
      await assertPromptResponse(response, 'OpenCode dispatch');
    }
    return unwrapOpenCodeResponse(await response.json().catch(() => null));
  };

  const isSessionIdle = async (sessionId: string, directory: string | undefined) => {
    const body = asRecord(await openCodeFetch('/api/session/active').catch(() => null));
    const statuses = asRecord(body && 'data' in body ? body.data : body);
    if (!statuses) return null;
    if (asRecord(statuses[sessionId])) return false;
    const page = await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}/message`, {
      directory,
      query: { limit: String(MESSAGE_TAIL_LIMIT) },
    }).catch(() => null);
    const messages = asList(asRecord(page)?.data);
    if (!messages) return null;
    const last = asRecord(messages[0]);
    const lastTime = asRecord(last?.time);
    if (last?.type === 'assistant' && asCount(lastTime?.completed) === null) {
      const created = asCount(lastTime?.created);
      if (created === null || created >= runtimeStartedAt) return false;
      console.log(`[message-queue] ignoring pre-boot unfinished tail for ${sessionId}`);
    }
    return true;
  };

  const resolveSlashCommand = async (text: string, directory: string | undefined) => {
    if (!text.startsWith('/')) return null;
    const [head = '', ...tail] = text.split(' ');
    const name = head.slice(1);
    if (!name) return null;
    const commands = asList(await openCodeFetch('/api/command', { directory })) ?? [];
    const match = commands.map((command) => asRecord(command)).find((command) => command?.name === name);
    if (!match) return null;
    return {
      name,
      arguments: tail.join(' '),
    };
  };

  const toPromptFile = (attachment: QueuedAttachment) => {
    const file: PromptFile = { uri: attachment.dataUrl };
    if (attachment.agentPath || attachment.filename) file.name = attachment.agentPath || attachment.filename;
    return file;
  };

  const toContextMessages = (part: QueuedContextPart) => {
    const body = { text: part.text, resume: false };
    if (part.kind !== 'context') return [body];
    const withMetadata = part.metadata ? { ...body, metadata: part.metadata } : body;
    return part.instructions
      ? [{ text: part.instructions, resume: false }, withMetadata]
      : [withMetadata];
  };

  const ensureSyntheticIds = async (item: QueuedItem, count: number) => {
    if (item.syntheticIds?.length === count) return;
    const firstAt = now() - count + 1;
    item.syntheticIds = Array.from({ length: count }, (_, index) => createMessageId(firstAt + index));
    try {
      await persist();
    } catch (error) {
      delete item.syntheticIds;
      throw error;
    }
  };

  const sendItem = async (sessionId: string, directory: string, item: QueuedItem) => {
    const { providerID, modelID, variant } = item.sendConfig;
    let agent = item.sendConfig.agent;
    let model: QueueModel = { id: modelID, providerID };
    if (variant) model.variant = variant;
    const promptFiles = item.attachments.map(toPromptFile);
    const synthetics = [
      ...item.context.flatMap(toContextMessages),
      ...(item.goal ? [{ text: buildGoalIntroText(item.goal.tokenBudget), resume: false }] : []),
    ];

    const routed = hasSelectedModel(model) ? await resolveAutoSelection?.({
      sessionId,
      directory,
      model,
      agent,
      requestText: `${item.text}${attachmentHint({ files: promptFiles })}`.trim(),
    }) : null;
    if (routed) {
      model = routed.model;
      agent = routed.agent ?? agent;
    }

    if (!item.scheduledTask || (providerID && modelID)) await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}/model`, {
      directory,
      method: 'POST',
      body: { model },
    });
    if (agent) {
      await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}/agent`, {
        directory,
        method: 'POST',
        body: { agent },
      });
    }

    const command = await resolveSlashCommand(item.text, directory);

    if (sessionKnowledgeRuntime) await sessionKnowledgeRuntime.sync(sessionId, directory);

    if (synthetics.length > 0) {
      await ensureSyntheticIds(item, synthetics.length);
      const session = asRecord(await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}`, { directory }));
      if (!session) throw new Error(`OpenCode returned no record for session ${sessionId}`);
      if (session.revert) {
        await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}/revert/commit`, { directory, method: 'POST' });
      }
    }

    if (item.goal) {
      await createSessionGoal({
        persistSessionGoal,
        sessionID: sessionId,
        directory,
        objective: item.goal.objective || item.text,
        tokenBudget: item.goal.tokenBudget,
        providerID: model.providerID,
        modelID: model.id,
        onWarning: (message: string, cause: unknown) => console.warn(`[message-queue] ${message}:`, (hasReadableFields(cause) ? cause.message : undefined) || cause),
      });
    }

    for (const [index, synthetic] of synthetics.entries()) {
      if (!item.syntheticIds) throw new Error('Queued synthetic IDs are missing');
      await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}/synthetic`, {
        directory,
        method: 'POST',
        body: { id: item.syntheticIds[index], ...synthetic },
      });
    }

    if (command) {
      const body: CommandBody = { name: command.name, text: command.arguments };
      if (promptFiles.length > 0) body.files = promptFiles;
      await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}/command`, {
        directory,
        method: 'POST',
        body,
      });
    } else {
      const body: PromptBody = { text: item.text };
      if (promptFiles.length > 0) body.files = promptFiles;
      if (item.agentMention) body.agents = [{ name: item.agentMention }];
      await openCodeFetch(`/api/session/${encodeURIComponent(sessionId)}/prompt`, {
        directory,
        method: 'POST',
        body,
      });
    }
  };

  const clearTimer = (sessionId: string) => {
    const existing = timers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      timers.delete(sessionId);
    }
  };

  const armDispatch = (sessionId: string, delayMs = dispatchQuietMs) => {
    if (stopped || !queues.has(sessionId)) return;
    clearTimer(sessionId);
    const timer = setTimeout(() => {
      timers.delete(sessionId);
      tick(sessionId).catch((error) => {
        console.warn('[message-queue] dispatch tick failed:', error?.message ?? error);
      });
    }, Math.max(0, delayMs));
    timer.unref?.();
    timers.set(sessionId, timer);
  };

  async function tick(sessionId: string) {
    if (stopped) return;
    const queue = queues.get(sessionId);
    if (!queue || queue.items.length === 0 || sending.has(sessionId) || isDeliveryHeld(sessionId)) return;

    const abortHoldUntil = (abortedAt.get(sessionId) ?? 0) + abortHoldMs;
    if (abortHoldUntil > now()) {
      armDispatch(sessionId, abortHoldUntil - now());
      return;
    }

    const head = queue.items[0];
    if (!head) throw new Error('Message queue head is missing');
    const failure = failures.get(sessionId);
    if (failure && failure.itemId !== head.id) failures.delete(sessionId);
    else if (failure && failure.nextAttemptAt > now()) {
      armDispatch(sessionId, failure.nextAttemptAt - now());
      return;
    }

    const idle = await isSessionIdle(sessionId, queue.directory);
    if (idle === null) {
      if (head.scheduledTask && validateScheduledTaskTarget) {
        try {
          await validateScheduledTaskTarget(head.scheduledTask.projectId, sessionId);
        } catch (error) {
          if (hasReadableFields(error) && (error.statusCode === 404 || error.statusCode === 409)) {
            const after = queues.get(sessionId);
            if (after) setQueueItems(sessionId, after.directory, after.items.filter((entry) => entry.id !== head.id), 'failed', error.message);
            commit(sessionId);
            armDispatch(sessionId);
            return;
          }
        }
      }
      armDispatch(sessionId, retryDelayMs(1));
      return;
    }
    if (!idle) return;

    const current = queues.get(sessionId);
    const item = current?.items[0];
    if (!current || !item || item.id !== head.id || sending.has(sessionId)) return;

    sending.set(sessionId, item.id);
    broadcast(sessionId);
    try {
      if (isScheduledItem(item)) {
        try {
          await beforeScheduledTaskSend?.(sessionId, current.directory, item);
        } catch (error) {
          if (!hasReadableFields(error) || (error.statusCode !== 404 && error.statusCode !== 409)) throw error;
          sending.delete(sessionId);
          const after = queues.get(sessionId);
          if (after) setQueueItems(sessionId, after.directory, after.items.filter((entry) => entry.id !== item.id), 'failed', error.message);
          failures.delete(sessionId);
          commit(sessionId);
          armDispatch(sessionId);
          return;
        }
      }
      await sendItem(sessionId, current.directory, item);
      const after = queues.get(sessionId);
      if (after) setQueueItems(sessionId, after.directory, after.items.filter((entry) => entry.id !== item.id), 'sent');
      failures.delete(sessionId);
      sending.delete(sessionId);
      commit(sessionId);
      try {
        onPromptSent?.(sessionId);
      } catch {
        void 0;
      }
      console.log(`[message-queue] sent queued message to ${sessionId}`);
    } catch (error) {
      sending.delete(sessionId);
      const count = (failure?.itemId === item.id ? failure.failures : 0) + 1;
      const nextAttemptAt = now() + retryDelayMs(count);
      failures.set(sessionId, { itemId: item.id, failures: count, nextAttemptAt });
      console.warn(`[message-queue] send to ${sessionId} failed (attempt ${count}):`, (hasReadableFields(error) ? error.message : undefined) ?? error);
      broadcast(sessionId);
      armDispatch(sessionId, nextAttemptAt - now());
    }
  }

  const reconcileAll = () => {
    for (const sessionId of queues.keys()) {
      if (!timers.has(sessionId)) armDispatch(sessionId, dispatchQuietMs);
    }
  };

  const requireSessionId = (sessionId: string | undefined) => {
    if (!isValidSessionId(sessionId)) throw new TypeError('sessionId is invalid');
    return sessionId;
  };

  const enqueue = async (sessionIdInput: string | undefined, directoryInput: z.input<typeof textSchema>, itemInput: z.input<typeof queuedItemInputSchema>) => {
    const sessionId = requireSessionId(sessionIdInput);
    const directory = asNonEmptyString(directoryInput);
    if (!directory) throw new TypeError('directory is required');
    const parsed = parseQueuedItemInput(itemInput);
    await load();
    if (parsed.scheduledTask) {
      for (const queue of queues.values()) {
        const provenance = parsed.scheduledTask;
        if (queue.items.some((entry) => entry.scheduledTask?.projectId === provenance.projectId && entry.scheduledTask.taskId === provenance.taskId)) {
          throw httpError('task is already queued', 409);
        }
      }
      if ((queues.get(sessionId)?.items.length ?? 0) >= MAX_ITEMS_PER_SESSION || (!queues.has(sessionId) && queues.size >= MAX_SESSIONS)) {
        throw httpError('message queue is full', 409);
      }
    }
    const item = {
      id: `queued-${now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: now(),
      ...parsed,
    };
    const existing = queues.get(sessionId);
    const items = [...(existing?.items ?? []), item].slice(-MAX_ITEMS_PER_SESSION);
    setQueueItems(sessionId, directory, items);
    directories.set(sessionId, directory);
    if (queues.size > MAX_SESSIONS) {
      const oldest = Array.from(queues.entries())
        .filter(([id]) => id !== sessionId && !sending.has(id))
        .sort((left, right) => (left[1].items[0]?.createdAt ?? 0) - (right[1].items[0]?.createdAt ?? 0))
        .slice(0, queues.size - MAX_SESSIONS);
      for (const [staleId] of oldest) {
        setQueueItems(staleId, directories.get(staleId), []);
        clearTimer(staleId);
        broadcast(staleId);
        directories.delete(staleId);
      }
    }
    const result = commit(sessionId);
    armDispatch(sessionId);
    return { ...result, itemId: item.id };
  };

  const remove = async (sessionIdInput: string | undefined, itemId: string | undefined) => {
    const sessionId = requireSessionId(sessionIdInput);
    await load();
    if (sending.get(sessionId) === itemId) throw httpError('message is being sent', 409);
    const queue = queues.get(sessionId);
    if (!queue || !queue.items.some((item) => item.id === itemId)) {
      return { revision, session: sessionSnapshot(sessionId) };
    }
    setQueueItems(sessionId, queue.directory, queue.items.filter((item) => item.id !== itemId));
    return commit(sessionId);
  };

  const take = async (sessionIdInput: string | undefined, itemId: string | undefined) => {
    const sessionId = requireSessionId(sessionIdInput);
    await load();
    if (sending.get(sessionId) === itemId) throw httpError('message is being sent', 409);
    const queue = queues.get(sessionId);
    const item = queue?.items.find((entry) => entry.id === itemId);
    if (!queue || !item) throw httpError('queued message not found', 404);
    if (item.scheduledTask) throw httpError('scheduled messages cannot be taken', 409);
    setQueueItems(sessionId, queue.directory, queue.items.filter((entry) => entry.id !== itemId));
    return { ...commit(sessionId), item };
  };

  const takeAll = async (sessionIdInput: string | undefined) => {
    const sessionId = requireSessionId(sessionIdInput);
    await load();
    const queue = queues.get(sessionId);
    if (!queue) return { revision, session: sessionSnapshot(sessionId), items: [] };
    const sendingId = sending.get(sessionId) ?? null;
    const items = queue.items.filter((item) => item.id !== sendingId && !item.scheduledTask);
    if (items.length === 0) return { revision, session: sessionSnapshot(sessionId), items: [] };
    setQueueItems(sessionId, queue.directory, queue.items.filter((item) => item.id === sendingId || item.scheduledTask));
    return { ...commit(sessionId), items };
  };

  const reorder = async (sessionIdInput: string | undefined, itemIds: z.input<typeof listSchema>) => {
    const sessionId = requireSessionId(sessionIdInput);
    if (!isList(itemIds) || itemIds.some((id) => !asNonEmptyString(id))) {
      throw new TypeError('itemIds must be a list of ids');
    }
    await load();
    const queue = queues.get(sessionId);
    if (!queue) return { revision, session: sessionSnapshot(sessionId) };
    const byId = new Map(queue.items.map((item) => [item.id, item]));
    const hasQueuedId = (id: unknown): id is string => isString(id) && byId.has(id);
    if (itemIds.length !== byId.size || new Set(itemIds).size !== itemIds.length || !itemIds.every(hasQueuedId)) {
      throw new TypeError('itemIds must list every queued message exactly once');
    }
    queues.set(sessionId, { directory: queue.directory, items: itemIds.map((id) => {
      const item = byId.get(id);
      if (!item) throw new Error('Queued message is missing');
      return item;
    }) });
    return commit(sessionId);
  };

  const clear = async (sessionIdInput: string | undefined) => {
    const sessionId = requireSessionId(sessionIdInput);
    await load();
    const queue = queues.get(sessionId);
    if (!queue) return { revision, session: sessionSnapshot(sessionId) };
    const sendingId = sending.get(sessionId) ?? null;
    setQueueItems(sessionId, queue.directory, queue.items.filter((item) => item.id === sendingId));
    clearTimer(sessionId);
    return commit(sessionId);
  };

  const release = (sessionId: string) => {
    armDispatch(sessionId);
  };

  const processPayload = z.unknown().transform((value) => {
    const payload = asRecord(value);
    if (stopped || !payload) return;

    const deletedSessionId = extractDeletedSessionId(payload);
    if (deletedSessionId) {
      if (!queues.has(deletedSessionId)) return;
      setQueueItems(deletedSessionId, directories.get(deletedSessionId), []);
      clearTimer(deletedSessionId);
      failures.delete(deletedSessionId);
      commit(deletedSessionId);
      directories.delete(deletedSessionId);
      return;
    }

    const moved = extractSessionDirectoryUpdate(payload);
    if (moved) {
      const queue = queues.get(moved.sessionId);
      if (queue && queue.directory !== moved.directory) {
        setQueueItems(moved.sessionId, moved.directory, queue.items);
        commit(moved.sessionId);
      }
      return;
    }

    const status = extractSessionStatus(payload);
    if (status) {
      if (!queues.has(status.sessionId)) return;
      if (status.type === 'idle') armDispatch(status.sessionId);
      else clearTimer(status.sessionId);
      return;
    }

    const abortedSessionId = extractAbortedSessionId(payload);
    if (abortedSessionId) {
      if (queues.has(abortedSessionId)) abortedAt.set(abortedSessionId, now());
      return;
    }

    const assistant = extractAssistantMessageUpdate(payload);
    if (assistant && queues.has(assistant.sessionId)) {
      if (assistant.completed && !timers.has(assistant.sessionId)) armDispatch(assistant.sessionId);
    }
  }).parse;

  const processEvent = (event: GlobalStreamEvent | null | undefined) => {
    for (const payload of event?.translated?.() ?? []) processPayload(payload);
  };

  const start = () => {
    const unsubscribeEvent = globalEventHub.subscribeEvent(processEvent);
    const unsubscribeStatus = globalEventHub.subscribeStatus((status) => {
      if (status?.type === 'connect') reconcileAll();
    });
    void load()
      .then(async () => {
        if (queues.size > 0) console.log(`[message-queue] restored queues for ${queues.size} session(s)`);
        await deliveryHoldReady;
        reconcileAll();
      })
      .catch((error) => {
        console.warn('[message-queue] failed to load queue file:', error?.message ?? error);
      });
    return () => {
      unsubscribeEvent();
      unsubscribeStatus();
    };
  };

  const stop = () => {
    stopped = true;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };

  const cancelScheduledTask = async (projectId: string, taskId: ScheduledTaskInput['id']) => {
    await load();
    for (const [sessionId, queue] of queues) {
      const items = queue.items.filter((item) => item.scheduledTask?.projectId !== projectId || item.scheduledTask.taskId !== taskId || sending.get(sessionId) === item.id);
      if (items.length === queue.items.length) continue;
      setQueueItems(sessionId, queue.directory, items);
      commit(sessionId);
      armDispatch(sessionId);
    }
  };

  return {
    load,
    snapshot,
    sessionSnapshot,
    enqueue,
    cancelScheduledTask,
    remove,
    take,
    takeAll,
    reorder,
    clear,
    release,
    processPayload,
    start,
    stop,
    flush: () => writePromise,
  };
}

export function registerMessageQueueRoutes(app: Application, runtime: ReturnType<typeof createMessageQueueRuntime>) {
  const respondError = (res: HttpResponse, cause: unknown, fallback: string) => {
    const statusValue = hasReadableFields(cause) ? cause.status : undefined;
    const status = cause instanceof TypeError ? 400 : (isInteger(statusValue) ? statusValue : 500);
    res.status(status).json({ error: (hasReadableFields(cause) ? cause.message : undefined) ?? fallback });
  };
>>>>>>> upstream/main:packages/web/server/lib/message-queue/runtime.ts

  app.get('/api/message-queue', async (_req, res) => {
    try {
      const listed = await listQueueScopes();
      if (!listed || !Array.isArray(listed.items) || !Array.isArray(listed.errors)) throw new PromptQueueError('INTERNAL_ERROR', 503, 'Queue scope listing is unavailable');
      const items = [];
      let maxRevision = 0;
      const errors = listed.errors.map((error) => ({ code: ProblemCodeSchema.safeParse(error?.code).success ? error.code : 'INTERNAL_ERROR' }));
      for (const scope of listed.items) {
        try {
          const state = QueueStateSchema.parse(await runtime.getState(scope));
          items.push(state);
          const rev = Number(state.revision) || 0;
          if (rev > maxRevision) maxRevision = rev;
        }
        catch (error) { errors.push({ code: ProblemCodeSchema.safeParse(error?.code).success ? error.code : 'INTERNAL_ERROR' }); }
      }
      res.json({ revision: maxRevision, items, errors });
    } catch (error) { respondError(res, error, 'Failed to load message queue'); }
  });

  app.post('/api/message-queue/sessions/:sessionId/items', async (req, res) => {
    try {
<<<<<<< HEAD:packages/web/server/lib/message-queue/runtime.js
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId);
      const { commandId: bodyCommandId, request } = appendInput(req.body);
      const commandId = bodyCommandId ?? req.get('Idempotency-Key') ?? randomUUID();
      res.json(QueueStateSchema.parse(await runtime.append(scope, commandId, request)));
    } catch (error) { respondError(res, error, 'Failed to queue message'); }
||||||| bc50ba56aa:packages/web/server/lib/message-queue/runtime.js
      if (req.body?.item?.scheduledTask) throw new TypeError('scheduledTask is server-owned');
      res.json(await runtime.enqueue(req.params.sessionId, req.body?.directory, req.body?.item));
    } catch (error) {
      respondError(res, error, 'Failed to queue message');
    }
  });

  app.post('/api/message-queue/sessions/:sessionId/take', async (req, res) => {
    try {
      res.json(await runtime.takeAll(req.params.sessionId));
    } catch (error) {
      respondError(res, error, 'Failed to take queued messages');
    }
=======
      const body = req.body;
      if (hasQueueBody(body) && hasScheduledTaskField(body.item) && body.item.scheduledTask) throw new TypeError('scheduledTask is server-owned');
      res.json(await runtime.enqueue(req.params.sessionId, hasQueueBody(body) ? body.directory : undefined, hasQueueBody(body) ? body.item : undefined));
    } catch (error) {
      respondError(res, error, 'Failed to queue message');
    }
  });

  app.post('/api/message-queue/sessions/:sessionId/take', async (req, res) => {
    try {
      res.json(await runtime.takeAll(req.params.sessionId));
    } catch (error) {
      respondError(res, error, 'Failed to take queued messages');
    }
>>>>>>> upstream/main:packages/web/server/lib/message-queue/runtime.ts
  });

  app.put('/api/message-queue/sessions/:sessionId/order', async (req, res) => {
    try {
<<<<<<< HEAD:packages/web/server/lib/message-queue/runtime.js
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId);
      res.json(QueueStateSchema.parse(await runtime.reorder(scope, QueueReorderRequestSchema.parse(req.body))));
    } catch (error) { respondError(res, error, 'Failed to reorder queue'); }
||||||| bc50ba56aa:packages/web/server/lib/message-queue/runtime.js
      res.json(await runtime.reorder(req.params.sessionId, req.body?.itemIds));
    } catch (error) {
      respondError(res, error, 'Failed to reorder queue');
    }
  });

  app.delete('/api/message-queue/sessions/:sessionId', async (req, res) => {
    try {
      res.json(await runtime.clear(req.params.sessionId));
    } catch (error) {
      respondError(res, error, 'Failed to clear queue');
    }
  });

  app.post('/api/message-queue/sessions/:sessionId/items/:itemId/take', async (req, res) => {
    try {
      res.json(await runtime.take(req.params.sessionId, req.params.itemId));
    } catch (error) {
      respondError(res, error, 'Failed to take queued message');
    }
=======
      res.json(await runtime.reorder(req.params.sessionId, hasQueueBody(req.body) ? req.body.itemIds : undefined));
    } catch (error) {
      respondError(res, error, 'Failed to reorder queue');
    }
  });

  app.delete('/api/message-queue/sessions/:sessionId', async (req, res) => {
    try {
      res.json(await runtime.clear(req.params.sessionId));
    } catch (error) {
      respondError(res, error, 'Failed to clear queue');
    }
  });

  app.post('/api/message-queue/sessions/:sessionId/items/:itemId/take', async (req, res) => {
    try {
      res.json(await runtime.take(req.params.sessionId, req.params.itemId));
    } catch (error) {
      respondError(res, error, 'Failed to take queued message');
    }
>>>>>>> upstream/main:packages/web/server/lib/message-queue/runtime.ts
  });

  app.delete('/api/message-queue/sessions/:sessionId/items/:itemId', async (req, res) => {
    try {
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId);
      res.json(QueueStateSchema.parse(await runtime.remove(scope, deleteInput(req.body, req.params.itemId))));
    } catch (error) { respondError(res, error, 'Failed to remove queued message'); }
  });
  app.put('/api/message-queue/sessions/:sessionId/hold', async (req, res) => {
    try {
      const scope = await scopeFor(resolveSessionScope, req.params.sessionId);
      res.json(runtime.setHold(scope, req.body?.held, req.body?.ttlMs));
    } catch (error) { respondError(res, error, 'Failed to update queue hold'); }
  });
}
export function registerCanonicalQueueRoutes(router, runtime, { resolveSessionScope } = {}) {
  if (typeof resolveSessionScope !== 'function') throw new TypeError('resolveSessionScope is required');
  const scope = (id) => scopeFor(resolveSessionScope, id);
  router.get('/sessions/:sessionId/queue', async (req, res) => { try { res.json(QueueStateSchema.parse(await runtime.getState(await scope(req.params.sessionId)))); } catch (error) { respondError(res, error, 'Failed to load prompt queue'); } });
  router.post('/sessions/:sessionId/queue', async (req, res) => { try { const { commandId: bodyCommandId, request } = appendInput(req.body); const commandId = bodyCommandId ?? req.get('Idempotency-Key') ?? randomUUID(); res.json(QueueStateSchema.parse(await runtime.append(await scope(req.params.sessionId), commandId, request))); } catch (error) { respondError(res, error, 'Failed to append prompt queue'); } });
  router.put('/sessions/:sessionId/queue/order', async (req, res) => { try { res.json(QueueStateSchema.parse(await runtime.reorder(await scope(req.params.sessionId), QueueReorderRequestSchema.parse(req.body)))); } catch (error) { respondError(res, error, 'Failed to reorder prompt queue'); } });
  router.delete('/sessions/:sessionId/queue/:queueItemId', async (req, res) => { try { res.json(QueueStateSchema.parse(await runtime.remove(await scope(req.params.sessionId), deleteInput(req.body, req.params.queueItemId)))); } catch (error) { respondError(res, error, 'Failed to remove prompt queue item'); } });
}
