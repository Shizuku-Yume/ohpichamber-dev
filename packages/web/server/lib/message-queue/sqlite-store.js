import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CapturedSendOptionsSchema, CounterSchema, EntityIdSchema, EpochSchema, PromptContextSchema, PromptRequestSchema,
  QueueAppendRequestSchema, QueueDeleteRequestSchema, QueueReorderRequestSchema, QueueStateSchema,
} from '@openchamber/agent-contract';
import { createMetadataLifecycle, openHostMetadataDatabase, withTransaction } from '../host/metadata-sqlite.js';

const ScopeSchema = z.strictObject({ sessionId: EntityIdSchema, projectId: EntityIdSchema, workspaceId: EntityIdSchema });
const CommandIdSchema = z.uuid({ version: 'v4' });
const ClaimSchema = z.strictObject({ epoch: EpochSchema, expiresAt: z.number().int().nonnegative() });
const PendingDeliverySchema = z.strictObject({ leaseId: EntityIdSchema, queueItemId: EntityIdSchema, runId: EntityIdSchema, epoch: EpochSchema, phase: z.enum(['claimed', 'submitting', 'accepted']) });
const ScheduledTaskModeSchema = z.enum(['existing', 'new']);
const ScheduledTaskMetadataSchema = z.strictObject({ mode: ScheduledTaskModeSchema.default('existing'), projectId: EntityIdSchema, taskId: EntityIdSchema });
const ScheduledTaskQuerySchema = z.strictObject({ projectId: EntityIdSchema, taskId: EntityIdSchema });
const StoredItemSchema = z.strictObject({ content: z.string(), contextPreview: z.string().optional(), request: PromptRequestSchema });
const ScheduledTaskProvenanceSchema = z.strictObject({ mode: z.literal('existing'), projectId: EntityIdSchema, taskId: EntityIdSchema, sessionId: EntityIdSchema, workspaceId: EntityIdSchema, triggeredAt: z.number().int().nonnegative() });
const LegacyAttachmentSchema = z.object({ id: z.string().min(1), filename: z.string().min(1), mimeType: z.string().min(1), size: z.number().int().nonnegative(), source: z.enum(['local', 'server']), serverPath: z.string().optional(), dataUrl: z.string().min(1) });
const LegacyItemSchema = z.object({
  id: EntityIdSchema, createdAt: z.number().int().nonnegative(), content: z.string(), text: z.string().optional(),
  contextPreview: z.string().optional(), attachments: z.array(LegacyAttachmentSchema), context: z.array(PromptContextSchema),
  agentMention: z.string().optional(), sendConfig: z.object({ providerID: z.string().min(1).optional(), modelID: z.string().min(1).optional(), agent: z.string().min(1).optional(), variant: z.string().min(1).optional() }),
  scheduledTask: z.object({ projectId: z.string().min(1), taskId: z.string().min(1) }).optional(),
}).refine((item) => item.scheduledTask !== undefined || (item.sendConfig.providerID !== undefined && item.sendConfig.modelID !== undefined), 'Legacy queued prompts capture their provider and model');
const LegacyScheduledResolutionSchema = z.strictObject({ options: CapturedSendOptionsSchema, context: z.array(PromptContextSchema).optional() });
const LegacySessionSchema = z.object({ directory: z.string().min(1), items: z.array(LegacyItemSchema) });
const LegacyDirectorySchema = z.object({ directory: z.string().min(1) });
const LegacyFileSchema = z.object({
  version: z.literal(1), revision: z.number().int().nonnegative(),
  sessions: z.record(z.string().min(1), z.json()),
});

export class PromptQueueError extends Error {
  constructor(code, status, detail, details) {
    super(detail);
    this.name = 'PromptQueueError'; this.code = code; this.status = status; this.details = details;
  }
}

const corrupt = () => new PromptQueueError('INTERNAL_ERROR', 503, 'Stored prompt queue cannot be read', { storage: 'corrupt' });
const stableJson = (value) => JSON.stringify(value, (_key, entry) => {
  if (entry === null || entry === undefined || Array.isArray(entry) || Object.getPrototypeOf(entry) !== Object.prototype) return entry;
  return Object.fromEntries(Object.keys(entry).sort().map((key) => [key, entry[key]]));
});
const hash = (value) => createHash('sha256').update(stableJson(value)).digest('hex');
const preview = (value) => value === undefined ? undefined : value.slice(0, 100) + (value.length > 100 ? '...' : '');

/** Host-owned delivery data only; the OMP transcript never enters this database. */
export function createPromptQueueStore({ dataDir, database, closeDatabase = database === undefined, now = Date.now } = {}) {
  const db = database ?? openHostMetadataDatabase({ dataDir }).db;
  db.exec(`
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS prompt_queue_owner (
      session_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, workspace_id TEXT NOT NULL, revision TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prompt_queue_item (
      session_id TEXT NOT NULL, item_id TEXT NOT NULL, position INTEGER NOT NULL, created_at INTEGER NOT NULL,
      payload TEXT NOT NULL, lease_id TEXT, lease_expires_at INTEGER,
      PRIMARY KEY(session_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS prompt_queue_delivery (
      lease_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, item_id TEXT NOT NULL, run_id TEXT NOT NULL UNIQUE,
      epoch TEXT NOT NULL, phase TEXT NOT NULL, updated_at INTEGER NOT NULL, error_code TEXT
    );
    CREATE TABLE IF NOT EXISTS prompt_queue_command (
      session_id TEXT NOT NULL, command_id TEXT NOT NULL, payload_hash TEXT NOT NULL, response TEXT NOT NULL,
      expires_at INTEGER NOT NULL, PRIMARY KEY(session_id, command_id)
    );
    CREATE TABLE IF NOT EXISTS prompt_queue_conversion (
      source_id TEXT PRIMARY KEY, source_hash TEXT NOT NULL, session_id TEXT
    );
  `);
  const lifecycle = createMetadataLifecycle(db, closeDatabase);
  const legacyPath = dataDir === undefined ? null : path.join(dataDir, 'message-queue.json');
  let conversionStatus = legacyPath !== null && fs.existsSync(legacyPath) ? 'pending' : 'missing';
  const conversionErrors = new Set();
  const read = (work) => lifecycle.run(() => {
    try { return work(); } catch (error) {
      if (error instanceof PromptQueueError || error instanceof z.ZodError) throw error;
      throw new PromptQueueError('INTERNAL_ERROR', 503, 'Could not read prompt queue', { storage: 'read_failed' });
    }
  });
  const write = (work) => lifecycle.run(() => {
    try { return withTransaction(db, work); } catch (error) {
      if (error instanceof PromptQueueError || error instanceof z.ZodError) throw error;
      throw new PromptQueueError('INTERNAL_ERROR', 503, 'Could not persist prompt queue', { storage: 'write_failed' });
    }
  });
  const owner = (scope, create = false) => {
    const parsed = ScopeSchema.parse(scope);
    let row = db.prepare('SELECT * FROM prompt_queue_owner WHERE session_id = ?').get(parsed.sessionId);
    if (!row && create) {
      db.prepare('INSERT INTO prompt_queue_owner VALUES (?, ?, ?, ?)').run(parsed.sessionId, parsed.projectId, parsed.workspaceId, '0');
      row = { session_id: parsed.sessionId, project_id: parsed.projectId, workspace_id: parsed.workspaceId, revision: '0' };
    }
    if (row && (row.project_id !== parsed.projectId || row.workspace_id !== parsed.workspaceId)) {
      throw new PromptQueueError('SESSION_NOT_FOUND', 404, 'Queue does not belong to the authorized workspace');
    }
    if (row && !CounterSchema.safeParse(row.revision).success) throw corrupt();
    return row;
  };
  const decode = (row) => {
    try { return StoredItemSchema.parse(JSON.parse(row.payload)); } catch { throw corrupt(); }
  };
  const scheduledTask = (stored, scope) => {
    for (const context of stored.request.input.context) {
      if (context.kind !== 'context' || context.metadata.scheduledTask === undefined) continue;
      const parsed = ScheduledTaskProvenanceSchema.safeParse(context.metadata.scheduledTask);
      if (!parsed.success) throw corrupt();
      if (parsed.data.mode === 'existing' && parsed.data.sessionId === scope.sessionId && parsed.data.workspaceId === scope.workspaceId) return parsed.data;
    }
    return null;
  };
  const matchingScheduledItems = (query) => {
    const parsed = ScheduledTaskQuerySchema.parse(query);
    const matches = [];
    for (const row of db.prepare('SELECT * FROM prompt_queue_item ORDER BY session_id, position, item_id').all()) {
      const scopeRow = db.prepare('SELECT project_id, workspace_id FROM prompt_queue_owner WHERE session_id = ?').get(row.session_id);
      if (!scopeRow) throw corrupt();
      const provenance = scheduledTask(decode(row), { sessionId: row.session_id, workspaceId: scopeRow.workspace_id });
      if (provenance?.projectId === parsed.projectId && provenance.taskId === parsed.taskId) matches.push({ row, provenance });
    }
    return matches;
  };
  const rows = (sessionId) => db.prepare('SELECT * FROM prompt_queue_item WHERE session_id = ? ORDER BY position, item_id').all(sessionId);
  const state = (scope) => {
    const record = owner(scope);
    if (!record && (conversionStatus === 'pending' || conversionStatus === 'failed' || conversionErrors.has(scope.sessionId))) {
      throw new PromptQueueError('INTERNAL_ERROR', 503, 'Legacy prompt queue conversion is incomplete', { storage: 'conversion_failed' });
    }
    if (!record) return QueueStateSchema.parse({ sessionId: scope.sessionId, revision: '0', items: [] });
    const items = rows(scope.sessionId).map((row) => {
      const stored = decode(row), input = stored.request.input;
      const item = {
        queueItemId: row.item_id, createdAt: row.created_at, content: stored.content, text: input.text,
        attachments: input.attachments, options: stored.request.options,
        context: input.context.map((entry, index) => {
          const descriptor = { index, kind: entry.kind, hasInstructions: entry.kind === 'context' && entry.instructions !== undefined };
          if (entry.kind === 'context' && entry.deliveryReceiptId !== undefined) descriptor.deliveryReceiptId = entry.deliveryReceiptId;
          return descriptor;
        }),
      };
      if (stored.contextPreview !== undefined) item.contextPreview = stored.contextPreview;
      if (input.agentMention !== undefined) item.agentMention = input.agentMention;
      return row.lease_id === null ? { ...item, status: 'queued' } : { ...item, status: 'leased', lease: { leaseId: row.lease_id, expiresAt: row.lease_expires_at } };
    });
    try { return QueueStateSchema.parse({ sessionId: scope.sessionId, revision: record.revision, items }); } catch { throw corrupt(); }
  };
  const checkRevision = (scope, expected) => {
    const current = state(scope);
    if (CounterSchema.parse(expected) !== current.revision) throw new PromptQueueError('QUEUE_CONFLICT', 409, 'Prompt queue changed', { queue: current });
    return current;
  };
  const bump = (scope) => {
    const current = owner(scope, true);
    const next = CounterSchema.parse((BigInt(current.revision) + 1n).toString());
    db.prepare('UPDATE prompt_queue_owner SET revision = ? WHERE session_id = ?').run(next, scope.sessionId);
  };
  const conflict = (scope) => { throw new PromptQueueError('QUEUE_CONFLICT', 409, 'The claimed prompt cannot be changed', { queue: state(scope) }); };
  const insert = (scope, itemId, createdAt, stored) => {
    const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM prompt_queue_item WHERE session_id = ?').get(scope.sessionId).position;
    db.prepare('INSERT INTO prompt_queue_item VALUES (?, ?, ?, ?, ?, NULL, NULL)').run(scope.sessionId, itemId, position, createdAt, JSON.stringify(StoredItemSchema.parse(stored)));
  };
  const delivery = (scope, leaseId) => {
    owner(scope);
    const record = db.prepare('SELECT * FROM prompt_queue_delivery WHERE lease_id = ? AND session_id = ?').get(EntityIdSchema.parse(leaseId), scope.sessionId);
    if (!record) throw new PromptQueueError('QUEUE_CONFLICT', 409, 'Prompt delivery claim is no longer current', { queue: state(scope) });
    return record;
  };
  const getDeliveryCapture = (scope, leaseId) => read(() => {
    const record = delivery(ScopeSchema.parse(scope), leaseId);
    const item = db.prepare('SELECT * FROM prompt_queue_item WHERE session_id = ? AND item_id = ?').get(scope.sessionId, record.item_id);
    if (!item) throw new PromptQueueError('QUEUE_CONFLICT', 409, 'Prompt delivery capture is no longer available');
    const stored = decode(item);
    return { queueItemId: record.item_id, leaseId: record.lease_id, runId: record.run_id, epoch: record.epoch, request: stored.request };
  });
  const activeItem = (scope, record) => {
    const item = db.prepare('SELECT * FROM prompt_queue_item WHERE session_id = ? AND item_id = ? AND lease_id = ?').get(scope.sessionId, record.item_id, record.lease_id);
    if (!item) conflict(scope);
    return item;
  };
  const restoreScheduledCancellation = (records) => write(() => {
    const restoredSessions = new Set();
    for (const record of records) {
      const scope = ScopeSchema.parse(record.scope);
      owner(scope, true);
      if (db.prepare('SELECT 1 FROM prompt_queue_item WHERE session_id = ? AND item_id = ?').get(scope.sessionId, record.row.item_id)) continue;
      db.prepare('INSERT INTO prompt_queue_item (session_id, item_id, position, created_at, payload, lease_id, lease_expires_at) VALUES (?, ?, ?, ?, ?, NULL, NULL)')
        .run(scope.sessionId, record.row.item_id, record.row.position, record.row.created_at, record.row.payload);
      restoredSessions.add(scope.sessionId);
    }
    for (const sessionId of restoredSessions) {
      const row = db.prepare('SELECT * FROM prompt_queue_owner WHERE session_id = ?').get(sessionId);
      if (row) db.prepare('UPDATE prompt_queue_owner SET revision = ? WHERE session_id = ?').run((BigInt(row.revision) + 1n).toString(), sessionId);
    }
  });
  const scheduledTaskProvenance = (request) => {
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
      const cancelled = [];
      const sessions = new Set();
      for (const match of matches) {
        const scopeRow = db.prepare('SELECT project_id, workspace_id FROM prompt_queue_owner WHERE session_id = ?').get(match.row.session_id);
        if (!scopeRow) throw corrupt();
        const scope = { sessionId: match.row.session_id, projectId: scopeRow.project_id, workspaceId: scopeRow.workspace_id };
        db.prepare('DELETE FROM prompt_queue_item WHERE session_id = ? AND item_id = ? AND lease_id IS NULL').run(match.row.session_id, match.row.item_id);
        cancelled.push({ scope, provenance: match.provenance, row: match.row });
        sessions.add(scope.sessionId);
      }
      for (const sessionId of sessions) bump({ sessionId, projectId: db.prepare('SELECT project_id FROM prompt_queue_owner WHERE session_id = ?').get(sessionId).project_id, workspaceId: db.prepare('SELECT workspace_id FROM prompt_queue_owner WHERE session_id = ?').get(sessionId).workspace_id });
      return { cancelled, queue: cancelled.map(({ scope }) => ({ scope, state: state(scope) })) };
    }),
    restoreScheduledCancellation,
    list: () => read(() => {
      const items = [], errors = [];
      for (const row of db.prepare('SELECT * FROM prompt_queue_owner').all()) {
        const scope = { sessionId: row.session_id, projectId: row.project_id, workspaceId: row.workspace_id };
        try { items.push({ scope, queue: state(scope) }); }
        catch { errors.push({ sessionId: row.session_id, code: 'INTERNAL_ERROR', storage: 'corrupt' }); }
      }
      return { items, errors };
    }),
    append: (scope, commandId, input) => write(() => {
      scope = ScopeSchema.parse(scope); commandId = CommandIdSchema.parse(commandId);
      const request = QueueAppendRequestSchema.parse(input);
      owner(scope);
      const fingerprint = hash(request), timestamp = now();
      const receipt = db.prepare('SELECT * FROM prompt_queue_command WHERE session_id = ? AND command_id = ? AND expires_at > ?').get(scope.sessionId, commandId, timestamp);
      if (receipt) {
        if (receipt.payload_hash !== fingerprint) throw new PromptQueueError('IDEMPOTENCY_CONFLICT', 400, 'Command key already identifies another queue request');
        try { return QueueStateSchema.parse(JSON.parse(receipt.response)); } catch { throw corrupt(); }
      }
      const provenance = scheduledTaskProvenance(request.request);
      if (provenance && matchingScheduledItems(provenance).length > 0) throw new PromptQueueError('QUEUE_CONFLICT', 409, 'task is already queued');
      checkRevision(scope, request.expectedRevision);
      owner(scope, true);
      if (request.content.length > 200_000 || request.request.input.text.length > 200_000) throw new PromptQueueError('PAYLOAD_TOO_LARGE', 413, 'Queued text exceeds its limit');
      const current = rows(scope.sessionId);
      if (current.length >= 20) throw new PromptQueueError('PAYLOAD_TOO_LARGE', 413, 'Session prompt queue is full');
      if (current.length === 0 && db.prepare('SELECT COUNT(DISTINCT session_id) AS count FROM prompt_queue_item').get().count >= 50) {
        throw new PromptQueueError('PAYLOAD_TOO_LARGE', 413, 'Host prompt queue is full');
      }
      insert(scope, randomUUID(), timestamp, { content: request.content, contextPreview: request.contextPreview, request: request.request });
      bump(scope);
      const result = state(scope);
      db.prepare('DELETE FROM prompt_queue_command WHERE expires_at <= ?').run(timestamp);
      db.prepare('INSERT OR REPLACE INTO prompt_queue_command VALUES (?, ?, ?, ?, ?)').run(scope.sessionId, commandId, fingerprint, JSON.stringify(result), timestamp + 86_400_000);
      return result;
    }),
    reorder: (scope, input) => write(() => {
      scope = ScopeSchema.parse(scope); const request = QueueReorderRequestSchema.parse(input);
      const current = checkRevision(scope, request.expectedRevision);
      const ids = request.queueItemIds;
      if (ids.length !== current.items.length || ids.some((id) => !current.items.some((item) => item.queueItemId === id))) conflict(scope);
      if (current.items.some((item, index) => item.status === 'leased' && ids[index] !== item.queueItemId)) conflict(scope);
      if (current.items.every((item, index) => ids[index] === item.queueItemId)) return current;
      for (const [index, id] of ids.entries()) db.prepare('UPDATE prompt_queue_item SET position = ? WHERE session_id = ? AND item_id = ?').run(index, scope.sessionId, id);
      bump(scope); return state(scope);
    }),
    remove: (scope, input) => write(() => {
      scope = ScopeSchema.parse(scope); const request = QueueDeleteRequestSchema.parse(input);
      const current = checkRevision(scope, request.expectedRevision);
      const item = current.items.find((entry) => entry.queueItemId === request.queueItemId);
      if (!item) return current;
      if (item.status === 'leased') conflict(scope);
      db.prepare('DELETE FROM prompt_queue_item WHERE session_id = ? AND item_id = ?').run(scope.sessionId, request.queueItemId);
      bump(scope); return state(scope);
    }),
    claimHead: (scope, expectedRevision, input) => write(() => {
      scope = ScopeSchema.parse(scope); const claim = ClaimSchema.parse(input);
      checkRevision(scope, expectedRevision);
      const head = rows(scope.sessionId)[0];
      if (!head || head.lease_id !== null) return { capture: null, queue: state(scope) };
      if (claim.expiresAt <= Math.max(now(), head.created_at)) throw new PromptQueueError('INVALID_REQUEST', 400, 'Lease expiry must be in the future');
      const capture = decode(head), leaseId = randomUUID(), runId = randomUUID();
      db.prepare('INSERT INTO prompt_queue_delivery VALUES (?, ?, ?, ?, ?, ?, ?, NULL)').run(leaseId, scope.sessionId, head.item_id, runId, claim.epoch, 'claimed', now());
      db.prepare('UPDATE prompt_queue_item SET lease_id = ?, lease_expires_at = ? WHERE session_id = ? AND item_id = ?').run(leaseId, claim.expiresAt, scope.sessionId, head.item_id);
      bump(scope);
      return { capture: { queueItemId: head.item_id, leaseId, runId, epoch: claim.epoch, request: capture.request }, queue: state(scope) };
    }),
    markSubmitting: (scope, leaseId) => write(() => {
      scope = ScopeSchema.parse(scope); const record = delivery(scope, leaseId); activeItem(scope, record);
      if (record.phase !== 'claimed') conflict(scope);
      db.prepare("UPDATE prompt_queue_delivery SET phase = 'submitting', updated_at = ? WHERE lease_id = ?").run(now(), leaseId);
    }),
    acknowledge: (scope, leaseId) => write(() => {
      scope = ScopeSchema.parse(scope); const record = delivery(scope, leaseId);
      if (record.phase === 'accepted' || record.phase === 'settled') return state(scope);
      if (record.phase !== 'submitting') conflict(scope);
      activeItem(scope, record);
      db.prepare("UPDATE prompt_queue_delivery SET phase = 'accepted', updated_at = ? WHERE lease_id = ?").run(now(), leaseId);
      db.prepare('DELETE FROM prompt_queue_item WHERE session_id = ? AND item_id = ?').run(scope.sessionId, record.item_id);
      bump(scope); return state(scope);
    }),
    retry: (scope, leaseId, code) => write(() => {
      scope = ScopeSchema.parse(scope); const record = delivery(scope, leaseId);
      if (record.phase === 'retry') return state(scope);
      if (record.phase !== 'claimed' && record.phase !== 'submitting') conflict(scope);
      activeItem(scope, record);
      db.prepare("UPDATE prompt_queue_delivery SET phase = 'retry', updated_at = ?, error_code = ? WHERE lease_id = ?").run(now(), EntityIdSchema.parse(code), leaseId);
      db.prepare('UPDATE prompt_queue_item SET lease_id = NULL, lease_expires_at = NULL WHERE session_id = ? AND item_id = ?').run(scope.sessionId, record.item_id);
      bump(scope); return state(scope);
    }),
    fail: (scope, leaseId, code) => write(() => {
      scope = ScopeSchema.parse(scope); const record = delivery(scope, leaseId);
      if (record.phase === 'failed') return state(scope);
      if (record.phase !== 'claimed' && record.phase !== 'submitting') conflict(scope);
      activeItem(scope, record);
      db.prepare("UPDATE prompt_queue_delivery SET phase = 'failed', updated_at = ?, error_code = ? WHERE lease_id = ?").run(now(), EntityIdSchema.parse(code), leaseId);
      db.prepare('DELETE FROM prompt_queue_item WHERE session_id = ? AND item_id = ?').run(scope.sessionId, record.item_id);
      bump(scope); return state(scope);
    }),
    settle: (scope, runId, code = null) => write(() => {
      scope = ScopeSchema.parse(scope); owner(scope);
      db.prepare("UPDATE prompt_queue_delivery SET phase = 'settled', updated_at = ?, error_code = ? WHERE session_id = ? AND run_id = ? AND phase = 'accepted'").run(now(), code, scope.sessionId, EntityIdSchema.parse(runId));
    }),
    pendingDeliveries: (scope) => read(() => {
      scope = ScopeSchema.parse(scope); owner(scope);
      return z.array(PendingDeliverySchema).parse(db.prepare("SELECT lease_id AS leaseId, item_id AS queueItemId, run_id AS runId, epoch, phase FROM prompt_queue_delivery WHERE session_id = ? AND phase IN ('claimed', 'submitting', 'accepted') ORDER BY updated_at").all(scope.sessionId));
    }),
    recoverUnsentClaims: (scope) => write(() => {
      scope = ScopeSchema.parse(scope); owner(scope);
      const expired = db.prepare("SELECT d.lease_id, d.item_id FROM prompt_queue_delivery d JOIN prompt_queue_item i ON i.session_id = d.session_id AND i.item_id = d.item_id AND i.lease_id = d.lease_id WHERE d.session_id = ? AND d.phase = 'claimed' AND i.lease_expires_at <= ?").all(scope.sessionId, now());
      for (const record of expired) {
        db.prepare("UPDATE prompt_queue_delivery SET phase = 'retry', updated_at = ? WHERE lease_id = ?").run(now(), record.lease_id);
        db.prepare('UPDATE prompt_queue_item SET lease_id = NULL, lease_expires_at = NULL WHERE session_id = ? AND item_id = ?').run(scope.sessionId, record.item_id);
      }
      if (expired.length > 0) bump(scope);
      return state(scope);
    }),
    convertLegacy: ({ resolveScope, importAttachment, resolveScheduledTask }) => lifecycle.run(async () => {
      if (legacyPath === null) return { status: 'missing', errors: [] };
      let source;
      try { source = fs.readFileSync(legacyPath, 'utf8'); }
      catch (error) {
        conversionStatus = error.code === 'ENOENT' ? 'missing' : 'failed';
        if (conversionStatus === 'missing') return { status: 'missing', errors: [] };
        return { status: 'failed', errors: [], storage: 'read_failed' };
      }
      let parsed;
      try { parsed = LegacyFileSchema.parse(JSON.parse(source)); }
      catch { conversionStatus = 'failed'; return { status: 'failed', errors: [], storage: 'corrupt' }; }
      const errors = [];
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
          const captured = [];
          for (const item of legacy.items) {
            const attachments = await Promise.all(item.attachments.map((attachment) => importAttachment(scope, attachment)));
            let options = CapturedSendOptionsSchema.parse({
              providerId: item.sendConfig.providerID ?? null,
              modelId: item.sendConfig.modelID ?? null,
              agentId: item.sendConfig.agent ?? null,
              variant: item.sendConfig.variant ?? null,
              reasoningEffort: null,
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
            if (item.agentMention) input.agentMention = { agentId: item.agentMention };
            const request = PromptRequestSchema.parse({ input, options });
            captured.push({ id: item.id, createdAt: item.createdAt, stored: StoredItemSchema.parse({ content: item.content, contextPreview: preview(item.contextPreview), request }) });
          }
          withTransaction(db, () => {
            // A completed owner never replays after deletion; conversion is not hydration.
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
