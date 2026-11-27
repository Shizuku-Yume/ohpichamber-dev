import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  EntityIdSchema,
  PromptRequestSchema,
  RunSchema,
  SteerAckSchema,
  FollowUpAckSchema,
  type FollowUpAck,
  type PromptRequest,
  type Run,
  type SteerAck,
} from '@openchamber/agent-contract';
import { createMetadataLifecycle, MetadataCorruptError, MetadataWriteError, withTransaction } from './metadata-sqlite.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import type { JsonValue } from '../shared/json-values.js';
import { isRecord } from '../shared/guards.js';

const ScopeSchema = z.object({ sessionId: EntityIdSchema, projectId: EntityIdSchema, workspaceId: EntityIdSchema });
const OperationSchema = z.enum(['send', 'steer', 'followUp']);
const SendAckSchema = z.strictObject({ run: RunSchema });
const CommandRowSchema = z.object({
  session_id: z.string(),
  command_id: z.string(),
  project_id: z.string(),
  workspace_id: z.string(),
  operation: z.string(),
  payload_hash: z.string(),
  claim_id: z.string(),
  state: z.string(),
  acknowledgment: z.string().nullable(),
  created_at: z.number(),
});

export type DirectCommandScope = z.infer<typeof ScopeSchema>;
export type DirectCommandOperation = z.infer<typeof OperationSchema>;
export type DirectCommandAcknowledgment = { run: Run } | SteerAck | FollowUpAck;
export type DirectCommandClaimResult =
  | { state: 'claimed'; claimId: string }
  | { state: 'accepted'; acknowledgment: DirectCommandAcknowledgment };

type CommandRow = z.infer<typeof CommandRowSchema>;

export interface DirectCommandAdmissionStoreOptions {
  database: DatabaseSync;
  now?: (() => number) | undefined;
}

export interface DirectCommandAdmissionStore {
  claim(scope: DirectCommandScope, commandId: string, operation: DirectCommandOperation, request: PromptRequest): Promise<DirectCommandClaimResult>;
  accept(scope: DirectCommandScope, commandId: string, claimId: string, acknowledgment: DirectCommandAcknowledgment): Promise<DirectCommandAcknowledgment>;
  release(scope: DirectCommandScope, commandId: string): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

const sortJsonValue = (entry: JsonValue | undefined): JsonValue | undefined => {
  if (entry === null || entry === undefined || Array.isArray(entry) || !isRecord(entry)) return entry;
  return Object.fromEntries(Object.keys(entry).sort().map((key) => [key, sortJsonValue(entry[key])]));
};

const stableJson = (value: JsonValue): string => JSON.stringify(sortJsonValue(value));

const inFlight = (): OpenChamberControlError =>
  new OpenChamberControlError('Command admission is pending or its acceptance is uncertain', 409, { code: 'COMMAND_IN_FLIGHT', retryable: false });

const parseAcknowledgment = (
  operation: DirectCommandOperation,
  acknowledgment: JsonValue | DirectCommandAcknowledgment,
  sessionId: string,
): DirectCommandAcknowledgment => {
  if (operation === 'send') {
    const parsed = SendAckSchema.parse(acknowledgment);
    if (parsed.run.sessionId !== sessionId) {
      throw new OpenChamberControlError('Command acknowledgement identified another session', 502, { code: 'INTERNAL_ERROR', retryable: false });
    }
    return parsed;
  }
  const parsed = (operation === 'steer' ? SteerAckSchema : FollowUpAckSchema).parse(acknowledgment);
  if (parsed.sessionId !== sessionId) {
    throw new OpenChamberControlError('Command acknowledgement identified another session', 502, { code: 'INTERNAL_ERROR', retryable: false });
  }
  return parsed;
};

const DIRECT_COMMAND_RETENTION_MS = 24 * 60 * 60 * 1000;

export function createDirectCommandAdmissionStore({
  database,
  now = Date.now,
}: DirectCommandAdmissionStoreOptions): DirectCommandAdmissionStore {
  const lifecycle = createMetadataLifecycle(database, false);
  const write = <Result>(work: () => Result): Promise<Result> => lifecycle.run(() => withTransaction(database, work)).catch((error) => {
    if (error instanceof OpenChamberControlError || error instanceof MetadataCorruptError || error instanceof z.ZodError) throw error;
    throw Object.assign(new MetadataWriteError('Could not persist direct command admission', error), { statusCode: 503, retryable: false });
  });
  const sweepExpired = (timestamp: number): void => {
    database.prepare("DELETE FROM host_direct_command WHERE state = 'accepted' AND created_at > 0 AND created_at + ? <= ?").run(DIRECT_COMMAND_RETENTION_MS, timestamp);
  };
  sweepExpired(now());
  const rowFor = (scope: DirectCommandScope, commandId: string): CommandRow | null => {
    const raw = database.prepare('SELECT * FROM host_direct_command WHERE session_id = ? AND command_id = ?').get(scope.sessionId, commandId);
    if (!raw) return null;
    const parsed = CommandRowSchema.safeParse(raw);
    if (!parsed.success) throw new MetadataCorruptError('Stored direct command admission has an invalid shape');
    const row = parsed.data;
    if (row.project_id !== scope.projectId || row.workspace_id !== scope.workspaceId) {
      throw new OpenChamberControlError('Command does not belong to the authorized workspace', 404, { code: 'SESSION_NOT_FOUND' });
    }
    return row;
  };
  return {
    claim: (scopeInput, commandIdInput, operationInput, request) => write(() => {
      const scope = ScopeSchema.parse(scopeInput);
      const commandId = EntityIdSchema.parse(commandIdInput);
      const operation = OperationSchema.parse(operationInput);
      const parsed = PromptRequestSchema.parse(request);
      const fingerprint = createHash('sha256').update(stableJson(parsed)).digest('hex');
      sweepExpired(now());
      const row = rowFor(scope, commandId);
      if (row && row.state === 'accepted' && row.created_at > 0 && row.created_at + DIRECT_COMMAND_RETENTION_MS <= now()) {
        database.prepare("DELETE FROM host_direct_command WHERE session_id = ? AND command_id = ? AND state = 'accepted'").run(scope.sessionId, commandId);
      } else if (row) {
        if (row.operation !== operation || row.payload_hash !== fingerprint) {
          throw new OpenChamberControlError('Command key already identifies another request', 400, { code: 'IDEMPOTENCY_CONFLICT' });
        }
        if (row.state === 'pending') throw inFlight();
        if (row.state !== 'accepted') throw new MetadataCorruptError('Stored direct command admission has an invalid state');
        try {
          if (row.acknowledgment === null) throw new Error('Missing stored acknowledgment');
          const decoded = z.json().parse(JSON.parse(row.acknowledgment));
          return { state: 'accepted', acknowledgment: parseAcknowledgment(operation, decoded, scope.sessionId) };
        } catch (error) {
          throw new MetadataCorruptError('Stored direct command acknowledgement cannot be read', error);
        }
      }
      const claimId = randomUUID();
      database.prepare(`INSERT INTO host_direct_command
        (session_id, command_id, project_id, workspace_id, operation, payload_hash, claim_id, state, acknowledgment, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?)`)
        .run(scope.sessionId, commandId, scope.projectId, scope.workspaceId, operation, fingerprint, claimId, now());
      return { state: 'claimed', claimId };
    }),
    accept: (scopeInput, commandIdInput, claimIdInput, acknowledgment) => write(() => {
      const scope = ScopeSchema.parse(scopeInput);
      const commandId = EntityIdSchema.parse(commandIdInput);
      const claimId = EntityIdSchema.parse(claimIdInput);
      const row = rowFor(scope, commandId);
      if (!row || row.state !== 'pending' || row.claim_id !== claimId) throw inFlight();
      const operation = OperationSchema.parse(row.operation);
      const parsed = parseAcknowledgment(operation, acknowledgment, scope.sessionId);
      const result = database.prepare("UPDATE host_direct_command SET state = 'accepted', acknowledgment = ?, created_at = ? WHERE session_id = ? AND command_id = ? AND claim_id = ? AND state = 'pending'")
        .run(JSON.stringify(parsed), now(), scope.sessionId, commandId, claimId);
      if (result.changes !== 1) throw inFlight();
      return parsed;
    }),
    release: (scopeInput, commandIdInput) => write(() => {
      const scope = ScopeSchema.parse(scopeInput);
      const commandId = EntityIdSchema.parse(commandIdInput);
      sweepExpired(now());
      database.prepare("DELETE FROM host_direct_command WHERE session_id = ? AND command_id = ? AND state = 'pending'").run(scope.sessionId, commandId);
    }),
    flush: lifecycle.flush,
    close: lifecycle.close,
  };
}
