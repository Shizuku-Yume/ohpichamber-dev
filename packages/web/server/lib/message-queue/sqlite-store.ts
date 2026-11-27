import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  CapturedSendOptionsSchema, CounterSchema, EntityIdSchema, EpochSchema, PromptContextSchema, PromptRequestSchema,
  QueueAppendRequestSchema, QueueDeleteRequestSchema, QueueOriginalDraftSchema, QueueReorderRequestSchema, QueueStateSchema, QueueTakeRequestSchema,
  type CapturedSendOptions, type PromptAttachment, type PromptContext, type PromptRequest, type QueueAppendRequest, type QueueDeleteRequest,
  type QueueItem, type QueueOriginalDraft, type QueueReorderRequest, type QueueState, type QueueTakeRequest,
} from '@openchamber/agent-contract';
import { createMetadataLifecycle, ensureHostMetadataSchema, openHostMetadataDatabase, withTransaction } from '../host/metadata-sqlite.js';
import type { JsonObject, JsonValue } from '../shared/json-values.js';

const ScopeSchema = z.strictObject({ sessionId: EntityIdSchema, projectId: EntityIdSchema, workspaceId: EntityIdSchema });
const CommandIdSchema = z.uuid({ version: 'v4' });
const ClaimSchema = z.strictObject({ epoch: EpochSchema, expiresAt: z.number().int().nonnegative() });
const PendingDeliverySchema = z.strictObject({ leaseId: EntityIdSchema, queueItemId: EntityIdSchema, runId: EntityIdSchema, epoch: EpochSchema, phase: z.enum(['claimed', 'submitting', 'accepted']) });
const ScheduledTaskQuerySchema = z.strictObject({ projectId: EntityIdSchema, taskId: EntityIdSchema });
const StoredItemSchema = z.strictObject({ content: z.string(), contextPreview: z.string().optional(), request: PromptRequestSchema, draft: QueueOriginalDraftSchema.optional() });
const ScheduledTaskProvenanceSchema = z.strictObject({ mode: z.literal('existing'), projectId: EntityIdSchema, taskId: EntityIdSchema, sessionId: EntityIdSchema, workspaceId: EntityIdSchema, triggeredAt: z.number().int().nonnegative() });
const LegacyAttachmentSchema = z.object({ id: z.string().min(1), filename: z.string().min(1), mimeType: z.string().min(1), size: z.number().int().nonnegative(), source: z.enum(['local', 'server']), serverPath: z.string().optional(), dataUrl: z.string().min(1) });
const LegacyItemSchema = z.object({
  id: EntityIdSchema, createdAt: z.number().int().nonnegative(), content: z.string(), text: z.string().optional(),
  contextPreview: z.string().optional(), attachments: z.array(LegacyAttachmentSchema), context: z.array(PromptContextSchema),
  agentMention: z.string().optional(), sendConfig: z.object({ providerID: z.string().min(1).optional(), modelID: z.string().min(1).optional(), agent: z.string().min(1).optional(), variant: z.string().min(1).optional(), reasoningEffort: z.string().min(1).optional() }),
  scheduledTask: z.object({ projectId: z.string().min(1), taskId: z.string().min(1) }).optional(),
}).refine((item) => item.scheduledTask !== undefined || (item.sendConfig.providerID !== undefined && item.sendConfig.modelID !== undefined), 'Legacy queued prompts capture their provider and model');
const LegacyScheduledResolutionSchema = z.strictObject({ options: CapturedSendOptionsSchema, context: z.array(PromptContextSchema).optional() });
const LegacySessionSchema = z.object({ directory: z.string().min(1), items: z.array(LegacyItemSchema) });
const LegacyDirectorySchema = z.object({ directory: z.string().min(1) });
const LegacyFileSchema = z.object({
  version: z.literal(1), revision: z.number().int().nonnegative(),
  sessions: z.record(z.string().min(1), z.json()),
});

const OwnerRowSchema = z.object({
  session_id: z.string(),
  project_id: z.string(),
  workspace_id: z.string(),
  revision: z.string(),
});
const OwnerScopeRowSchema = z.object({
  project_id: z.string(),
  workspace_id: z.string(),
});
const MigrationItemRowSchema = z.object({
  session_id: z.string(),
  item_id: z.string(),
  payload: z.string(),
});
const ItemRowSchema = z.object({
  session_id: z.string(),
  item_id: z.string(),
  position: z.number().int(),
  created_at: z.number().int(),
  payload: z.string(),
  lease_id: z.string().nullable(),
  lease_expires_at: z.number().int().nullable(),
});
const DeliveryRowSchema = z.object({
  lease_id: z.string(),
  session_id: z.string(),
  item_id: z.string(),
  run_id: z.string(),
  epoch: z.string(),
  phase: z.string(),
  updated_at: z.number().int(),
  error_code: z.string().nullable(),
});
const CommandRowSchema = z.object({
  payload_hash: z.string(),
  response: z.string(),
});
const ExpiredClaimRowSchema = z.object({
  lease_id: z.string(),
  item_id: z.string(),
});
const NextPositionRowSchema = z.object({
  position: z.number().int(),
});
const SessionCountRowSchema = z.object({
  count: z.number().int(),
});
const ErrnoCodeSchema = z.object({
  code: z.string(),
});

export type PromptQueueScope = z.infer<typeof ScopeSchema>;
export type PromptQueueClaimInput = z.infer<typeof ClaimSchema>;
export type PromptQueuePendingDelivery = z.infer<typeof PendingDeliverySchema>;
export type PromptQueueScheduledTaskQuery = z.infer<typeof ScheduledTaskQuerySchema>;
export type PromptQueueScheduledTaskProvenance = z.infer<typeof ScheduledTaskProvenanceSchema>;
export type LegacyAttachmentInput = z.infer<typeof LegacyAttachmentSchema>;
export type LegacyScheduledResolution = z.infer<typeof LegacyScheduledResolutionSchema>;
type StoredItem = z.infer<typeof StoredItemSchema>;
type OwnerRow = z.infer<typeof OwnerRowSchema>;
type ItemRow = z.infer<typeof ItemRowSchema>;
type DeliveryRow = z.infer<typeof DeliveryRowSchema>;

export interface PromptQueueCapture {
  queueItemId: string;
  leaseId: string;
  runId: string;
  epoch: string;
  request: PromptRequest;
}

export interface PromptQueueCancelledItem {
  scope: PromptQueueScope;
  provenance: PromptQueueScheduledTaskProvenance;
  row: ItemRow;
}

export interface PromptQueueStoredEntry {
  content: string;
  contextPreview?: string | undefined;
  request: PromptRequest;
  draft?: QueueOriginalDraft | undefined;
  createdAt: number;
}

export interface PromptQueueListEntry {
  scope: PromptQueueScope;
  queue: QueueState;
}

export interface PromptQueueListError {
  sessionId: string;
  code: 'INTERNAL_ERROR';
  storage: 'corrupt';
}

export interface PromptQueueListResult {
  items: PromptQueueListEntry[];
  errors: PromptQueueListError[];
}

export interface LegacyScheduledTaskHint {
  projectId: string;
  taskId: string;
}

export interface LegacyScheduledContextEntry {
  kind: 'context';
  text: string;
  metadata: {
    scheduledTask: {
      projectId: string;
      taskId: string;
      sessionId: string;
      workspaceId: string;
      mode: 'new' | 'existing';
      triggeredAt?: number | undefined;
    };
  };
  deliveryReceiptId?: string;
}

export interface ConvertLegacyQueueCallbacks {
  resolveScope: (sourceId: string, directory: string) => Promise<PromptQueueScope>;
  importAttachment: (scope: PromptQueueScope, attachment: LegacyAttachmentInput) => Promise<PromptAttachment>;
  resolveScheduledTask: (scope: PromptQueueScope, hint: LegacyScheduledTaskHint) => Promise<{
    options: CapturedSendOptions;
    context?: Array<PromptContext | LegacyScheduledContextEntry> | undefined;
  }>;
}

export interface ConvertLegacyQueueResult {
  status: 'missing' | 'partial' | 'complete' | 'failed';
  errors: Array<{ sourceId: string; code: 'INTERNAL_ERROR'; storage: 'conversion_failed' }>;
  storage?: 'read_failed' | 'corrupt';
}

export interface PromptQueueLogger {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
}

export interface PromptQueueStoreOptions {
  dataDir?: string | undefined;
  database?: DatabaseSync | undefined;
  closeDatabase?: boolean;
  now?: () => number;
  logger?: PromptQueueLogger;
}

export interface PromptQueueStore {
  getState: (scope: PromptQueueScope) => Promise<QueueState>;
  getDeliveryCapture: (scope: PromptQueueScope, leaseId: string) => Promise<PromptQueueCapture>;
  scheduledTaskProvenance: (request: PromptRequest | JsonValue) => PromptQueueScheduledTaskProvenance | null;
  hasScheduledTask: (query: PromptQueueScheduledTaskQuery) => Promise<boolean>;
  cancelScheduledTask: (query: PromptQueueScheduledTaskQuery) => Promise<{
    cancelled: PromptQueueCancelledItem[];
    queue: Array<{ scope: PromptQueueScope; state: QueueState }>;
  }>;
  restoreScheduledCancellation: (records: readonly PromptQueueCancelledItem[]) => Promise<void>;
  list: () => Promise<PromptQueueListResult>;
  append: (scope: PromptQueueScope, commandId: string, input: QueueAppendRequest | JsonValue) => Promise<QueueState>;
  reorder: (scope: PromptQueueScope, input: QueueReorderRequest | JsonValue) => Promise<QueueState>;
  take: (scope: PromptQueueScope, input: QueueTakeRequest | JsonValue) => Promise<{ queue: QueueState; stored: PromptQueueStoredEntry }>;
  remove: (scope: PromptQueueScope, input: QueueDeleteRequest | JsonValue) => Promise<QueueState>;
  claimHead: (scope: PromptQueueScope, expectedRevision: string, input: PromptQueueClaimInput) => Promise<{
    capture: PromptQueueCapture | null;
    queue: QueueState;
  }>;
  markSubmitting: (scope: PromptQueueScope, leaseId: string) => Promise<void>;
  acknowledge: (scope: PromptQueueScope, leaseId: string) => Promise<QueueState>;
  retry: (scope: PromptQueueScope, leaseId: string, code: string) => Promise<QueueState>;
  fail: (scope: PromptQueueScope, leaseId: string, code: string) => Promise<QueueState>;
  settle: (scope: PromptQueueScope, runId: string, code?: string | null) => Promise<void>;
  pendingDeliveries: (scope: PromptQueueScope) => Promise<PromptQueuePendingDelivery[]>;
  recoverUnsentClaims: (scope: PromptQueueScope) => Promise<QueueState>;
  convertLegacy: (callbacks: ConvertLegacyQueueCallbacks) => Promise<ConvertLegacyQueueResult>;
  flush: () => Promise<void>;
  close: () => Promise<void>;
}

export class PromptQueueError extends Error {
  code: string;
  status: number;
  statusCode?: number;
  details: JsonObject | undefined;

  constructor(code: string, status: number, detail: string, details?: JsonObject) {
    super(detail);
    this.name = 'PromptQueueError'; this.code = code; this.status = status; this.details = details;
  }
}

const corrupt = () => new PromptQueueError('INTERNAL_ERROR', 503, 'Stored prompt queue cannot be read', { storage: 'corrupt' });
const isJsonObject = (entry: unknown): entry is JsonObject =>
  entry !== null && entry !== undefined && !Array.isArray(entry) && Object.getPrototypeOf(entry) === Object.prototype;
const stableJson = (value: QueueAppendRequest | JsonValue): string => JSON.stringify(value, (_key, entry: JsonValue | undefined) => {
  if (!isJsonObject(entry)) return entry;
  return Object.fromEntries(Object.keys(entry).sort().map((key) => [key, entry[key]]));
});
const hash = (value: QueueAppendRequest | JsonValue): string => createHash('sha256').update(stableJson(value)).digest('hex');
const preview = (value: string | undefined): string | undefined =>
  value === undefined ? undefined : value.slice(0, 100) + (value.length > 100 ? '...' : '');

export function createPromptQueueStore({
  dataDir = undefined,
  database = undefined,
  closeDatabase = database === undefined,
  now = Date.now,
  logger = console,
}: PromptQueueStoreOptions = {}): PromptQueueStore {
  const db = database ?? openHostMetadataDatabase({ dataDir }).db;
  if (database) {
    ensureHostMetadataSchema(db);
  }
  const migrateRootAgentIds = (): number => {
    let changed = 0;
    withTransaction(db, () => {
      for (const rawRow of db.prepare('SELECT session_id, item_id, payload FROM prompt_queue_item').all()) {
        const row = MigrationItemRowSchema.parse(rawRow);
        let stored: StoredItem;
        try { stored = StoredItemSchema.parse(JSON.parse(row.payload)); } catch { throw corrupt(); }
        if (stored.request.options.agentId === null) continue;
        const request = { ...stored.request, options: { ...stored.request.options, agentId: null } };
        db.prepare('UPDATE prompt_queue_item SET payload = ? WHERE session_id = ? AND item_id = ?').run(JSON.stringify({ ...stored, request }), row.session_id, row.item_id);
        changed += 1;
      }
    });
    logger.info?.(`[message-queue] root agent migration changed=${changed}`);
    return changed;
  };
  migrateRootAgentIds();
  const lifecycle = createMetadataLifecycle(db, closeDatabase);
  const legacyPath = dataDir === undefined ? null : path.join(dataDir, 'message-queue.json');
  let conversionStatus: 'pending' | 'missing' | 'failed' | 'partial' | 'complete' = legacyPath !== null && fs.existsSync(legacyPath) ? 'pending' : 'missing';
  const conversionErrors = new Set<string>();
  const read = <Result>(work: () => Result): Promise<Result> => lifecycle.run(() => {
    try { return work(); } catch (error) {
      if (error instanceof PromptQueueError || error instanceof z.ZodError) throw error;
      throw new PromptQueueError('INTERNAL_ERROR', 503, 'Could not read prompt queue', { storage: 'read_failed' });
    }
  });
  const write = <Result>(work: () => Result): Promise<Result> => lifecycle.run(() => {
    try { return withTransaction(db, work); } catch (error) {
      if (error instanceof PromptQueueError || error instanceof z.ZodError) throw error;
      throw new PromptQueueError('INTERNAL_ERROR', 503, 'Could not persist prompt queue', { storage: 'write_failed' });
    }
  });
  function owner(scope: PromptQueueScope, create: true): OwnerRow;
  function owner(scope: PromptQueueScope, create?: boolean): OwnerRow | undefined;
  function owner(scope: PromptQueueScope, create = false): OwnerRow | undefined {
    const parsed = ScopeSchema.parse(scope);
    const rawRow = db.prepare('SELECT * FROM prompt_queue_owner WHERE session_id = ?').get(parsed.sessionId);
    let row = rawRow === undefined ? undefined : OwnerRowSchema.parse(rawRow);
    if (!row && create) {
      db.prepare('INSERT INTO prompt_queue_owner VALUES (?, ?, ?, ?)').run(parsed.sessionId, parsed.projectId, parsed.workspaceId, '0');
      row = { session_id: parsed.sessionId, project_id: parsed.projectId, workspace_id: parsed.workspaceId, revision: '0' };
    }
    if (row && (row.project_id !== parsed.projectId || row.workspace_id !== parsed.workspaceId)) {
      throw new PromptQueueError('SESSION_NOT_FOUND', 404, 'Queue does not belong to the authorized workspace');
    }
    if (row && !CounterSchema.safeParse(row.revision).success) throw corrupt();
    return row;
  }
  const decode = (row: Pick<ItemRow, 'payload'>): StoredItem => {
    try { return StoredItemSchema.parse(JSON.parse(row.payload)); } catch { throw corrupt(); }
  };
  const scheduledTask = (stored: StoredItem, scope: { sessionId: string; workspaceId: string }): PromptQueueScheduledTaskProvenance | null => {
    for (const context of stored.request.input.context) {
      if (context.kind !== 'context' || context.metadata.scheduledTask === undefined) continue;
      const parsed = ScheduledTaskProvenanceSchema.safeParse(context.metadata.scheduledTask);
      if (!parsed.success) throw corrupt();
      if (parsed.data.mode === 'existing' && parsed.data.sessionId === scope.sessionId && parsed.data.workspaceId === scope.workspaceId) return parsed.data;
    }
    return null;
  };
  const matchingScheduledItems = (query: PromptQueueScheduledTaskQuery): Array<{ row: ItemRow; provenance: PromptQueueScheduledTaskProvenance }> => {
    const parsed = ScheduledTaskQuerySchema.parse(query);
    const matches: Array<{ row: ItemRow; provenance: PromptQueueScheduledTaskProvenance }> = [];
    for (const rawRow of db.prepare('SELECT * FROM prompt_queue_item ORDER BY session_id, position, item_id').all()) {
      const row = ItemRowSchema.parse(rawRow);
      const rawScope = db.prepare('SELECT project_id, workspace_id FROM prompt_queue_owner WHERE session_id = ?').get(row.session_id);
      if (!rawScope) throw corrupt();
      const scopeRow = OwnerScopeRowSchema.parse(rawScope);
      const provenance = scheduledTask(decode(row), { sessionId: row.session_id, workspaceId: scopeRow.workspace_id });
      if (provenance?.projectId === parsed.projectId && provenance.taskId === parsed.taskId) matches.push({ row, provenance });
    }
    return matches;
  };
  const rows = (sessionId: string): ItemRow[] =>
    db.prepare('SELECT * FROM prompt_queue_item WHERE session_id = ? ORDER BY position, item_id').all(sessionId).map((rawRow) => ItemRowSchema.parse(rawRow));
  const state = (scope: PromptQueueScope): QueueState => {
    const record = owner(scope);
    if (!record && (conversionStatus === 'pending' || conversionStatus === 'failed' || conversionErrors.has(scope.sessionId))) {
      throw new PromptQueueError('INTERNAL_ERROR', 503, 'Legacy prompt queue conversion is incomplete', { storage: 'conversion_failed' });
    }
    if (!record) return QueueStateSchema.parse({ sessionId: scope.sessionId, revision: '0', items: [] });
    const items: QueueItem[] = rows(scope.sessionId).map((row) => {
      const stored = decode(row);
      const input = stored.request.input;
      const descriptorOf = (entry: PromptContext, index: number): QueueItem['context'][number] => {
        const descriptor: QueueItem['context'][number] = {
          index,
          kind: entry.kind,
          hasInstructions: entry.kind === 'context' && entry.instructions !== undefined,
        };
        if (entry.kind === 'context' && entry.deliveryReceiptId !== undefined) descriptor.deliveryReceiptId = entry.deliveryReceiptId;
        return descriptor;
      };
      const baseItem: Omit<Extract<QueueItem, { status: 'queued' }>, 'status'> = {
        queueItemId: row.item_id,
        createdAt: row.created_at,
        content: stored.content,
        text: input.text,
        attachments: input.attachments,
        options: stored.request.options,
        context: input.context.map(descriptorOf),
        originalAvailable: stored.draft !== undefined,
      };
      if (stored.contextPreview !== undefined) baseItem.contextPreview = stored.contextPreview;
      if (input.agentMention !== undefined) baseItem.agentMention = input.agentMention;
      if (row.lease_id === null) {
        return { ...baseItem, status: 'queued' as const };
      }
      if (row.lease_expires_at === null) throw corrupt();
      return { ...baseItem, status: 'leased' as const, lease: { leaseId: row.lease_id, expiresAt: row.lease_expires_at } };
    });
    try { return QueueStateSchema.parse({ sessionId: scope.sessionId, revision: record.revision, items }); } catch { throw corrupt(); }
  };
  const checkRevision = (scope: PromptQueueScope, expected: string): QueueState => {
    const current = state(scope);
    if (CounterSchema.parse(expected) !== current.revision) throw new PromptQueueError('QUEUE_CONFLICT', 409, 'Prompt queue changed', { queue: current });
    return current;
  };
  const bump = (scope: PromptQueueScope): void => {
    const current = owner(scope, true);
    const next = CounterSchema.parse((BigInt(current.revision) + 1n).toString());
    db.prepare('UPDATE prompt_queue_owner SET revision = ? WHERE session_id = ?').run(next, scope.sessionId);
  };
  const conflict = (scope: PromptQueueScope): never => {
    throw new PromptQueueError('QUEUE_CONFLICT', 409, 'The claimed prompt cannot be changed', { queue: state(scope) });
  };
  const insert = (scope: PromptQueueScope, itemId: string, createdAt: number, stored: StoredItem): void => {
    const positionRow = NextPositionRowSchema.parse(
      db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM prompt_queue_item WHERE session_id = ?').get(scope.sessionId),
    );
    db.prepare('INSERT INTO prompt_queue_item VALUES (?, ?, ?, ?, ?, NULL, NULL)').run(
      scope.sessionId, itemId, positionRow.position, createdAt, JSON.stringify(StoredItemSchema.parse(stored)),
    );
  };
  const delivery = (scope: PromptQueueScope, leaseId: string): DeliveryRow => {
    owner(scope);
    const rawRecord = db.prepare('SELECT * FROM prompt_queue_delivery WHERE lease_id = ? AND session_id = ?').get(EntityIdSchema.parse(leaseId), scope.sessionId);
    if (!rawRecord) throw new PromptQueueError('QUEUE_CONFLICT', 409, 'Prompt delivery claim is no longer current', { queue: state(scope) });
    return DeliveryRowSchema.parse(rawRecord);
  };
  const getDeliveryCapture = (scope: PromptQueueScope, leaseId: string): Promise<PromptQueueCapture> => read(() => {
    const parsedScope = ScopeSchema.parse(scope);
    const record = delivery(parsedScope, leaseId);
    const rawItem = db.prepare('SELECT * FROM prompt_queue_item WHERE session_id = ? AND item_id = ?').get(parsedScope.sessionId, record.item_id);
    if (!rawItem) throw new PromptQueueError('QUEUE_CONFLICT', 409, 'Prompt delivery capture is no longer available');
    const stored = decode(ItemRowSchema.parse(rawItem));
    return { queueItemId: record.item_id, leaseId: record.lease_id, runId: record.run_id, epoch: record.epoch, request: stored.request };
  });
  const activeItem = (scope: PromptQueueScope, record: DeliveryRow): ItemRow => {
    const rawItem = db.prepare('SELECT * FROM prompt_queue_item WHERE session_id = ? AND item_id = ? AND lease_id = ?').get(scope.sessionId, record.item_id, record.lease_id);
    if (!rawItem) return conflict(scope);
    return ItemRowSchema.parse(rawItem);
  };
  const restoreScheduledCancellation = (records: readonly PromptQueueCancelledItem[]): Promise<void> => write(() => {
    const restoredSessions = new Set<string>();
    for (const record of records) {
      const scope = ScopeSchema.parse(record.scope);
      owner(scope, true);
      if (db.prepare('SELECT 1 FROM prompt_queue_item WHERE session_id = ? AND item_id = ?').get(scope.sessionId, record.row.item_id)) continue;
      db.prepare('INSERT INTO prompt_queue_item (session_id, item_id, position, created_at, payload, lease_id, lease_expires_at) VALUES (?, ?, ?, ?, ?, NULL, NULL)')
        .run(scope.sessionId, record.row.item_id, record.row.position, record.row.created_at, record.row.payload);
      restoredSessions.add(scope.sessionId);
    }
    for (const sessionId of restoredSessions) {
      const rawRow = db.prepare('SELECT * FROM prompt_queue_owner WHERE session_id = ?').get(sessionId);
      if (!rawRow) continue;
      const row = OwnerRowSchema.parse(rawRow);
      db.prepare('UPDATE prompt_queue_owner SET revision = ? WHERE session_id = ?').run((BigInt(row.revision) + 1n).toString(), sessionId);
    }
  });
  const scheduledTaskProvenance = (request: PromptRequest | JsonValue): PromptQueueScheduledTaskProvenance | null => {
    const parsed = PromptRequestSchema.parse(request);
    for (const context of parsed.input.context) {
      if (context.kind === 'context' && context.metadata.scheduledTask !== undefined) return ScheduledTaskProvenanceSchema.parse(context.metadata.scheduledTask);
    }
    return null;
  };
  return {
    getState: (scope) => read(() => state(ScopeSchema.parse(scope))),
    getDeliveryCapture,
    scheduledTaskProvenance,
    hasScheduledTask: (query) => read(() => matchingScheduledItems(query).length > 0),
    cancelScheduledTask: (query) => write(() => {
      const matches = matchingScheduledItems(query).filter(({ row }) => row.lease_id === null);
      const cancelled: PromptQueueCancelledItem[] = [];
      const sessions = new Set<string>();
      for (const match of matches) {
        const rawScope = db.prepare('SELECT project_id, workspace_id FROM prompt_queue_owner WHERE session_id = ?').get(match.row.session_id);
        if (!rawScope) throw corrupt();
        const scopeRow = OwnerScopeRowSchema.parse(rawScope);
        const scope: PromptQueueScope = { sessionId: match.row.session_id, projectId: scopeRow.project_id, workspaceId: scopeRow.workspace_id };
        db.prepare('DELETE FROM prompt_queue_item WHERE session_id = ? AND item_id = ? AND lease_id IS NULL').run(match.row.session_id, match.row.item_id);
        cancelled.push({ scope, provenance: match.provenance, row: match.row });
        sessions.add(scope.sessionId);
      }
      for (const sessionId of sessions) {
        const rawScope = db.prepare('SELECT project_id, workspace_id FROM prompt_queue_owner WHERE session_id = ?').get(sessionId);
        if (!rawScope) throw corrupt();
        const scopeRow = OwnerScopeRowSchema.parse(rawScope);
        bump({ sessionId, projectId: scopeRow.project_id, workspaceId: scopeRow.workspace_id });
      }
      return { cancelled, queue: cancelled.map(({ scope }) => ({ scope, state: state(scope) })) };
    }),
    restoreScheduledCancellation,
    list: () => read(() => {
      const items: PromptQueueListEntry[] = [];
      const errors: PromptQueueListError[] = [];
      for (const rawRow of db.prepare('SELECT * FROM prompt_queue_owner').all()) {
        const row = OwnerRowSchema.parse(rawRow);
        const scope: PromptQueueScope = { sessionId: row.session_id, projectId: row.project_id, workspaceId: row.workspace_id };
        try { items.push({ scope, queue: state(scope) }); }
        catch { errors.push({ sessionId: row.session_id, code: 'INTERNAL_ERROR', storage: 'corrupt' }); }
      }
      return { items, errors };
    }),
    append: (scope, commandId, input) => write(() => {
      const parsedScope = ScopeSchema.parse(scope);
      const parsedCommandId = CommandIdSchema.parse(commandId);
      const request = QueueAppendRequestSchema.parse(input);
      owner(parsedScope);
      const fingerprint = hash(request);
      const timestamp = now();
      const rawReceipt = db.prepare('SELECT * FROM prompt_queue_command WHERE session_id = ? AND command_id = ? AND expires_at > ?').get(parsedScope.sessionId, parsedCommandId, timestamp);
      if (rawReceipt) {
        const receipt = CommandRowSchema.parse(rawReceipt);
        if (receipt.payload_hash !== fingerprint) throw new PromptQueueError('IDEMPOTENCY_CONFLICT', 400, 'Command key already identifies another queue request');
        try { return QueueStateSchema.parse(JSON.parse(receipt.response)); } catch { throw corrupt(); }
      }
      const provenance = scheduledTaskProvenance(request.request);
      if (provenance && matchingScheduledItems(provenance).length > 0) throw new PromptQueueError('QUEUE_CONFLICT', 409, 'task is already queued');
      checkRevision(parsedScope, request.expectedRevision);
      owner(parsedScope, true);
      if (request.content.length > 200_000 || request.request.input.text.length > 200_000) throw new PromptQueueError('PAYLOAD_TOO_LARGE', 413, 'Queued text exceeds its limit');
      const current = rows(parsedScope.sessionId);
      if (current.length >= 20) throw new PromptQueueError('PAYLOAD_TOO_LARGE', 413, 'Session prompt queue is full');
      if (current.length === 0 && SessionCountRowSchema.parse(db.prepare('SELECT COUNT(DISTINCT session_id) AS count FROM prompt_queue_item').get()).count >= 50) {
        throw new PromptQueueError('PAYLOAD_TOO_LARGE', 413, 'Host prompt queue is full');
      }
      insert(parsedScope, randomUUID(), timestamp, { content: request.content, contextPreview: request.contextPreview, request: request.request, draft: request.draft });
      bump(parsedScope);
      const result = state(parsedScope);
      db.prepare('DELETE FROM prompt_queue_command WHERE expires_at <= ?').run(timestamp);
      db.prepare('INSERT OR REPLACE INTO prompt_queue_command VALUES (?, ?, ?, ?, ?)').run(parsedScope.sessionId, parsedCommandId, fingerprint, JSON.stringify(result), timestamp + 86_400_000);
      return result;
    }),
    reorder: (scope, input) => write(() => {
      const parsedScope = ScopeSchema.parse(scope);
      const request = QueueReorderRequestSchema.parse(input);
      const current = checkRevision(parsedScope, request.expectedRevision);
      const ids = request.queueItemIds;
      if (ids.length !== current.items.length || ids.some((id) => !current.items.some((item) => item.queueItemId === id))) conflict(parsedScope);
      if (current.items.some((item, index) => item.status === 'leased' && ids[index] !== item.queueItemId)) conflict(parsedScope);
      if (current.items.every((item, index) => ids[index] === item.queueItemId)) return current;
      for (const [index, id] of ids.entries()) db.prepare('UPDATE prompt_queue_item SET position = ? WHERE session_id = ? AND item_id = ?').run(index, parsedScope.sessionId, id);
      bump(parsedScope); return state(parsedScope);
    }),
    take: (scope, input) => write(() => {
      const parsedScope = ScopeSchema.parse(scope);
      const request = QueueTakeRequestSchema.parse(input);
      checkRevision(parsedScope, request.expectedRevision);
      const rawRow = db.prepare('SELECT * FROM prompt_queue_item WHERE session_id = ? AND item_id = ?').get(parsedScope.sessionId, request.queueItemId);
      if (!rawRow) throw new PromptQueueError('SESSION_NOT_FOUND', 404, 'Queued message is no longer in the queue', { queue: state(parsedScope) });
      const row = ItemRowSchema.parse(rawRow);
      if (row.lease_id !== null) conflict(parsedScope);
      const stored = decode(row);
      db.prepare('DELETE FROM prompt_queue_item WHERE session_id = ? AND item_id = ?').run(parsedScope.sessionId, request.queueItemId);
      bump(parsedScope);
      return { queue: state(parsedScope), stored: { ...stored, createdAt: row.created_at } };
    }),
    remove: (scope, input) => write(() => {
      const parsedScope = ScopeSchema.parse(scope);
      const request = QueueDeleteRequestSchema.parse(input);
      const current = checkRevision(parsedScope, request.expectedRevision);
      const item = current.items.find((entry) => entry.queueItemId === request.queueItemId);
      if (!item) return current;
      if (item.status === 'leased') conflict(parsedScope);
      db.prepare('DELETE FROM prompt_queue_item WHERE session_id = ? AND item_id = ?').run(parsedScope.sessionId, request.queueItemId);
      bump(parsedScope); return state(parsedScope);
    }),
    claimHead: (scope, expectedRevision, input) => write(() => {
      const parsedScope = ScopeSchema.parse(scope);
      const claim = ClaimSchema.parse(input);
      checkRevision(parsedScope, expectedRevision);
      const head = rows(parsedScope.sessionId)[0];
      if (!head || head.lease_id !== null) return { capture: null, queue: state(parsedScope) };
      if (claim.expiresAt <= Math.max(now(), head.created_at)) throw new PromptQueueError('INVALID_REQUEST', 400, 'Lease expiry must be in the future');
      const capture = decode(head);
      const leaseId = randomUUID();
      const runId = randomUUID();
      db.prepare('INSERT INTO prompt_queue_delivery VALUES (?, ?, ?, ?, ?, ?, ?, NULL)').run(leaseId, parsedScope.sessionId, head.item_id, runId, claim.epoch, 'claimed', now());
      db.prepare('UPDATE prompt_queue_item SET lease_id = ?, lease_expires_at = ? WHERE session_id = ? AND item_id = ?').run(leaseId, claim.expiresAt, parsedScope.sessionId, head.item_id);
      bump(parsedScope);
      return { capture: { queueItemId: head.item_id, leaseId, runId, epoch: claim.epoch, request: capture.request }, queue: state(parsedScope) };
    }),
    markSubmitting: (scope, leaseId) => write(() => {
      const parsedScope = ScopeSchema.parse(scope);
      const record = delivery(parsedScope, leaseId);
      activeItem(parsedScope, record);
      if (record.phase !== 'claimed') conflict(parsedScope);
      db.prepare("UPDATE prompt_queue_delivery SET phase = 'submitting', updated_at = ? WHERE lease_id = ?").run(now(), leaseId);
    }),
    acknowledge: (scope, leaseId) => write(() => {
      const parsedScope = ScopeSchema.parse(scope);
      const record = delivery(parsedScope, leaseId);
      if (record.phase === 'accepted' || record.phase === 'settled') return state(parsedScope);
      if (record.phase !== 'submitting') conflict(parsedScope);
      activeItem(parsedScope, record);
      db.prepare("UPDATE prompt_queue_delivery SET phase = 'accepted', updated_at = ? WHERE lease_id = ?").run(now(), leaseId);
      db.prepare('DELETE FROM prompt_queue_item WHERE session_id = ? AND item_id = ?').run(parsedScope.sessionId, record.item_id);
      bump(parsedScope); return state(parsedScope);
    }),
    retry: (scope, leaseId, code) => write(() => {
      const parsedScope = ScopeSchema.parse(scope);
      const record = delivery(parsedScope, leaseId);
      if (record.phase === 'retry') return state(parsedScope);
      if (record.phase !== 'claimed' && record.phase !== 'submitting') conflict(parsedScope);
      activeItem(parsedScope, record);
      db.prepare("UPDATE prompt_queue_delivery SET phase = 'retry', updated_at = ?, error_code = ? WHERE lease_id = ?").run(now(), EntityIdSchema.parse(code), leaseId);
      db.prepare('UPDATE prompt_queue_item SET lease_id = NULL, lease_expires_at = NULL WHERE session_id = ? AND item_id = ?').run(parsedScope.sessionId, record.item_id);
      bump(parsedScope); return state(parsedScope);
    }),
    fail: (scope, leaseId, code) => write(() => {
      const parsedScope = ScopeSchema.parse(scope);
      const record = delivery(parsedScope, leaseId);
      if (record.phase === 'failed') return state(parsedScope);
      if (record.phase !== 'claimed' && record.phase !== 'submitting') conflict(parsedScope);
      activeItem(parsedScope, record);
      db.prepare("UPDATE prompt_queue_delivery SET phase = 'failed', updated_at = ?, error_code = ? WHERE lease_id = ?").run(now(), EntityIdSchema.parse(code), leaseId);
      db.prepare('DELETE FROM prompt_queue_item WHERE session_id = ? AND item_id = ?').run(parsedScope.sessionId, record.item_id);
      bump(parsedScope); return state(parsedScope);
    }),
    settle: (scope, runId, code = null) => write(() => {
      const parsedScope = ScopeSchema.parse(scope);
      owner(parsedScope);
      db.prepare("UPDATE prompt_queue_delivery SET phase = 'settled', updated_at = ?, error_code = ? WHERE session_id = ? AND run_id = ? AND phase = 'accepted'").run(now(), code, parsedScope.sessionId, EntityIdSchema.parse(runId));
    }),
    pendingDeliveries: (scope) => read(() => {
      const parsedScope = ScopeSchema.parse(scope);
      owner(parsedScope);
      return z.array(PendingDeliverySchema).parse(db.prepare("SELECT lease_id AS leaseId, item_id AS queueItemId, run_id AS runId, epoch, phase FROM prompt_queue_delivery WHERE session_id = ? AND phase IN ('claimed', 'submitting', 'accepted') ORDER BY updated_at").all(parsedScope.sessionId));
    }),
    recoverUnsentClaims: (scope) => write(() => {
      const parsedScope = ScopeSchema.parse(scope);
      owner(parsedScope);
      const expired = db.prepare("SELECT d.lease_id, d.item_id FROM prompt_queue_delivery d JOIN prompt_queue_item i ON i.session_id = d.session_id AND i.item_id = d.item_id AND i.lease_id = d.lease_id WHERE d.session_id = ? AND d.phase = 'claimed' AND i.lease_expires_at <= ?")
        .all(parsedScope.sessionId, now())
        .map((rawRow) => ExpiredClaimRowSchema.parse(rawRow));
      for (const record of expired) {
        db.prepare("UPDATE prompt_queue_delivery SET phase = 'retry', updated_at = ? WHERE lease_id = ?").run(now(), record.lease_id);
        db.prepare('UPDATE prompt_queue_item SET lease_id = NULL, lease_expires_at = NULL WHERE session_id = ? AND item_id = ?').run(parsedScope.sessionId, record.item_id);
      }
      if (expired.length > 0) bump(parsedScope);
      return state(parsedScope);
    }),
    convertLegacy: ({ resolveScope, importAttachment, resolveScheduledTask }) => lifecycle.run(async () => {
      if (legacyPath === null) return { status: 'missing', errors: [] };
      let source: string;
      try { source = fs.readFileSync(legacyPath, 'utf8'); }
      catch (error) {
        const parsedError = ErrnoCodeSchema.safeParse(error);
        conversionStatus = parsedError.success && parsedError.data.code === 'ENOENT' ? 'missing' : 'failed';
        if (conversionStatus === 'missing') return { status: 'missing', errors: [] };
        return { status: 'failed', errors: [], storage: 'read_failed' };
      }
      let parsed: z.infer<typeof LegacyFileSchema>;
      try { parsed = LegacyFileSchema.parse(JSON.parse(source)); }
      catch { conversionStatus = 'failed'; return { status: 'failed', errors: [], storage: 'corrupt' }; }
      const errors: Array<{ sourceId: string; code: 'INTERNAL_ERROR'; storage: 'conversion_failed' }> = [];
      conversionErrors.clear();
      for (const [sourceId, raw] of Object.entries(parsed.sessions)) {
        let targetSessionId = sourceId;
        try {
          const sourceHash = hash(raw);
          const receipt = db.prepare('SELECT * FROM prompt_queue_conversion WHERE source_id = ?').get(sourceId);
          if (receipt) continue;
          const { directory } = LegacyDirectorySchema.parse(raw);
          const scope = ScopeSchema.parse(await resolveScope(sourceId, directory));
          targetSessionId = scope.sessionId;
          const legacy = LegacySessionSchema.parse(raw);
          const captured: Array<{ id: string; createdAt: number; stored: StoredItem }> = [];
          for (const item of legacy.items) {
            const attachments = await Promise.all(item.attachments.map((attachment) => importAttachment(scope, attachment)));
            let options: CapturedSendOptions = CapturedSendOptionsSchema.parse({
              providerId: item.sendConfig.providerID ?? null,
              modelId: item.sendConfig.modelID ?? null,
              agentId: null,
              variant: item.sendConfig.variant ?? null,
              reasoningEffort: item.sendConfig.reasoningEffort ?? null,
            });
            let context = item.context;
            if (item.scheduledTask) {
              const resolved = LegacyScheduledResolutionSchema.parse(await resolveScheduledTask(scope, item.scheduledTask));
              options = resolved.options;
              context = resolved.context ?? context;
              const hasProvenance = context.some((entry) => entry.kind === 'context' && entry.metadata.scheduledTask !== undefined);
              if (!hasProvenance) context = [...context, { kind: 'context', text: '', metadata: { scheduledTask: { mode: 'existing', projectId: item.scheduledTask.projectId, taskId: item.scheduledTask.taskId, sessionId: scope.sessionId, workspaceId: scope.workspaceId, triggeredAt: item.createdAt } } }];
            }
            const input = { text: item.text ?? item.content, attachments, context };
            const request = PromptRequestSchema.parse({ input, options });
            captured.push({ id: item.id, createdAt: item.createdAt, stored: StoredItemSchema.parse({ content: item.content, contextPreview: preview(item.contextPreview), request }) });
          }
          withTransaction(db, () => {
            if (db.prepare('SELECT 1 FROM prompt_queue_conversion WHERE source_id = ?').get(sourceId)) return;
            const existing = owner(scope, true);
            if (rows(scope.sessionId).length > 0) conflict(scope);
            for (const item of captured) insert(scope, item.id, item.createdAt, item.stored);
            const revision = BigInt(existing.revision) > BigInt(parsed.revision) ? existing.revision : String(parsed.revision);
            db.prepare('UPDATE prompt_queue_owner SET revision = ? WHERE session_id = ?').run(revision, scope.sessionId);
            db.prepare('INSERT INTO prompt_queue_conversion VALUES (?, ?, ?)').run(sourceId, sourceHash, scope.sessionId);
          });
        } catch {
          conversionErrors.add(targetSessionId);
          errors.push({ sourceId, code: 'INTERNAL_ERROR', storage: 'conversion_failed' });
        }
      }
      conversionStatus = errors.length > 0 ? 'partial' : 'complete';
      return { status: errors.length > 0 ? 'partial' : 'complete', errors };
    }),
    flush: lifecycle.flush,
    close: lifecycle.close,
  };
}
