import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { EntityIdSchema, PromptRequestSchema, RunSchema, SteerAckSchema, FollowUpAckSchema } from '@openchamber/agent-contract';
import { createMetadataLifecycle, MetadataCorruptError, MetadataWriteError, withTransaction } from './metadata-sqlite.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';

const ScopeSchema = z.object({ sessionId: EntityIdSchema, projectId: EntityIdSchema, workspaceId: EntityIdSchema });
const OperationSchema = z.enum(['send', 'steer', 'followUp']);
const acknowledgmentSchemas = { send: z.strictObject({ run: RunSchema }), steer: SteerAckSchema, followUp: FollowUpAckSchema };
const stableJson = (value) => JSON.stringify(value, (_key, entry) => {
  if (entry === null || Array.isArray(entry) || typeof entry !== 'object') return entry;
  return Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]]));
});
const inFlight = () => new OpenChamberControlError('Command admission is pending or its acceptance is uncertain', 409, { code: 'COMMAND_IN_FLIGHT', retryable: false });
const parseAcknowledgment = (operation, acknowledgment, sessionId) => {
  const parsed = acknowledgmentSchemas[operation].parse(acknowledgment);
  if ((operation === 'send' ? parsed.run.sessionId : parsed.sessionId) !== sessionId) {
    throw new OpenChamberControlError('Command acknowledgement identified another session', 502, { code: 'INTERNAL_ERROR', retryable: false });
  }
  return parsed;
};

/** Pending admissions have no timeout: a lost native acceptance cannot authorize another dispatch. */
export function createDirectCommandAdmissionStore({ database }) {
  const lifecycle = createMetadataLifecycle(database, false);
  const write = (work) => lifecycle.run(() => withTransaction(database, work)).catch(error => {
    if (error instanceof OpenChamberControlError || error instanceof MetadataCorruptError || error instanceof z.ZodError) throw error;
    throw Object.assign(new MetadataWriteError('Could not persist direct command admission', error), { statusCode: 503, retryable: false });
  });
  const rowFor = (scope, commandId) => {
    const row = database.prepare('SELECT * FROM host_direct_command WHERE session_id = ? AND command_id = ?').get(scope.sessionId, commandId);
    if (row && (row.project_id !== scope.projectId || row.workspace_id !== scope.workspaceId)) {
      throw new OpenChamberControlError('Command does not belong to the authorized workspace', 404, { code: 'SESSION_NOT_FOUND' });
    }
    return row;
  };
  return {
    claim: (scope, commandId, operation, request) => write(() => {
      scope = ScopeSchema.parse(scope);
      commandId = EntityIdSchema.parse(commandId);
      operation = OperationSchema.parse(operation);
      const parsed = PromptRequestSchema.parse(request);
      const fingerprint = createHash('sha256').update(stableJson(parsed)).digest('hex');
      const row = rowFor(scope, commandId);
      if (row) {
        if (row.operation !== operation || row.payload_hash !== fingerprint) {
          throw new OpenChamberControlError('Command key already identifies another request', 400, { code: 'IDEMPOTENCY_CONFLICT' });
        }
        if (row.state === 'pending') throw inFlight();
        if (row.state !== 'accepted') throw new MetadataCorruptError('Stored direct command admission has an invalid state');
        try { return { state: 'accepted', acknowledgment: parseAcknowledgment(operation, JSON.parse(row.acknowledgment), scope.sessionId) }; }
        catch (error) { throw new MetadataCorruptError('Stored direct command acknowledgement cannot be read', error); }
      }
      const claimId = randomUUID();
      database.prepare(`INSERT INTO host_direct_command
        (session_id, command_id, project_id, workspace_id, operation, payload_hash, claim_id, state, acknowledgment)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL)`)
        .run(scope.sessionId, commandId, scope.projectId, scope.workspaceId, operation, fingerprint, claimId);
      return { state: 'claimed', claimId };
    }),
    accept: (scope, commandId, claimId, acknowledgment) => write(() => {
      scope = ScopeSchema.parse(scope);
      commandId = EntityIdSchema.parse(commandId);
      claimId = EntityIdSchema.parse(claimId);
      const row = rowFor(scope, commandId);
      if (!row || row.state !== 'pending' || row.claim_id !== claimId) throw inFlight();
      const operation = OperationSchema.parse(row.operation);
      const parsed = parseAcknowledgment(operation, acknowledgment, scope.sessionId);
      const result = database.prepare("UPDATE host_direct_command SET state = 'accepted', acknowledgment = ? WHERE session_id = ? AND command_id = ? AND claim_id = ? AND state = 'pending'")
        .run(JSON.stringify(parsed), scope.sessionId, commandId, claimId);
      if (result.changes !== 1) throw inFlight();
      return parsed;
    }),
    flush: lifecycle.flush,
    close: lifecycle.close,
  };
}
