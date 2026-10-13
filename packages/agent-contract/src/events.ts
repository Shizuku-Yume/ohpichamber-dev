import { z } from 'zod';
import { CounterSchema, EntityIdSchema, EpochSchema, JsonObjectSchema, JsonValueSchema, PositiveCounterSchema, TimestampSchema } from './primitives.ts';
import { SessionMetadataSchema } from './metadata.ts';
import { RuntimeSessionSchema, SessionRuntimeStatusSchema } from './session.ts';
import { PartSchema, TokenUsageSchema, ToolStatusSchema } from './messages.ts';
import { ApprovalRequestSchema, QuestionRequestSchema } from './requests.ts';
import { QueueStateSchema } from './queue.ts';
import { CatalogUpdateSchema } from './catalogs.ts';
import { ShellJobSchema } from './shell.ts';

export const DataEventEnvelopeSchema = z.strictObject({
  sessionId: EntityIdSchema,
  epoch: EpochSchema,
  sequence: PositiveCounterSchema,
  timestamp: TimestampSchema,
});
export type DataEventEnvelope = z.infer<typeof DataEventEnvelopeSchema>;

const sessionUpdatedSchema = DataEventEnvelopeSchema.extend({
  type: z.literal('session.updated'),
  session: RuntimeSessionSchema.optional(),
  metadata: SessionMetadataSchema.nullable().optional(),
  metadataRevision: CounterSchema.optional(),
  archivedAt: TimestampSchema.nullable().optional(),
  archiveRevision: CounterSchema.optional(),
}).refine((event) => {
  const metadataPresent = event.metadata !== undefined;
  const archivePresent = event.archivedAt !== undefined;
  return (event.session !== undefined || metadataPresent || archivePresent)
    && metadataPresent === (event.metadataRevision !== undefined)
    && archivePresent === (event.archiveRevision !== undefined)
    && (!metadataPresent || (event.metadata === null) === (event.metadataRevision === '0'));
}, { message: 'Host projections require their exact independent revisions' });

const sessionStatusSchema = DataEventEnvelopeSchema.extend({
  type: z.literal('session.status'),
  runtimeStatus: SessionRuntimeStatusSchema,
  activeRunId: EntityIdSchema.nullable(),
}).refine((event) => (event.runtimeStatus === 'idle' || event.runtimeStatus === 'unavailable') === (event.activeRunId === null), {
  message: 'Runtime status must identify its live outer run',
});

export const CanonicalEventSchema = z.discriminatedUnion('type', [
  sessionUpdatedSchema,
  DataEventEnvelopeSchema.extend({ type: z.literal('session.deleted'), deletedSessionIds: z.array(EntityIdSchema).min(1) }),
  sessionStatusSchema,
  DataEventEnvelopeSchema.extend({ type: z.literal('run.started'), runId: EntityIdSchema, createdAt: TimestampSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('run.completed'), runId: EntityIdSchema, finishedAt: TimestampSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('run.failed'), runId: EntityIdSchema, finishedAt: TimestampSchema, error: z.string() }),
  DataEventEnvelopeSchema.extend({ type: z.literal('run.cancelled'), runId: EntityIdSchema, finishedAt: TimestampSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('turn.started'), turnId: EntityIdSchema, runId: EntityIdSchema, userMessageId: EntityIdSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('turn.completed'), turnId: EntityIdSchema, runId: EntityIdSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('message.created'), messageId: EntityIdSchema, turnId: EntityIdSchema, role: z.enum(['user', 'assistant', 'system']), providerId: z.string().min(1).optional(), modelId: z.string().min(1).optional(), usage: TokenUsageSchema.optional() }),
  DataEventEnvelopeSchema.extend({ type: z.literal('part.started'), messageId: EntityIdSchema, part: PartSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('part.delta'), partId: EntityIdSchema, delta: z.string() }),
  DataEventEnvelopeSchema.extend({ type: z.literal('part.completed'), part: PartSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('tool.started'), toolCallId: EntityIdSchema, toolName: z.string().min(1), input: JsonObjectSchema }),
  DataEventEnvelopeSchema.extend({
    type: z.literal('tool.completed'), toolCallId: EntityIdSchema,
    status: ToolStatusSchema.extract(['completed', 'failed', 'denied', 'cancelled']),
    isError: z.boolean(), output: JsonValueSchema.optional(), error: z.string().optional(),
  }),
  DataEventEnvelopeSchema.extend({
    type: z.literal('approval.requested'), approval: ApprovalRequestSchema.refine((request) => request.status === 'pending', { message: 'Requested approval must be pending' }),
  }),
  DataEventEnvelopeSchema.extend({
    type: z.literal('approval.resolved'), approval: ApprovalRequestSchema.refine((request) => request.status !== 'pending', { message: 'Resolved approval must be terminal' }),
  }),
  DataEventEnvelopeSchema.extend({
    type: z.literal('question.requested'), question: QuestionRequestSchema.refine((request) => request.status === 'pending', { message: 'Requested question must be pending' }),
  }),
  DataEventEnvelopeSchema.extend({
    type: z.literal('question.resolved'), question: QuestionRequestSchema.refine((request) => request.status !== 'pending', { message: 'Resolved question must be terminal' }),
  }),
  DataEventEnvelopeSchema.extend({ type: z.literal('queue.updated'), queue: QueueStateSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('catalog.updated'), catalog: CatalogUpdateSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('shell.updated'), job: ShellJobSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('session.compacted'), compactionId: EntityIdSchema, tokensBefore: z.number().int().nonnegative(), completedAt: TimestampSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('message.updated'), messageId: EntityIdSchema, providerId: z.string().min(1).optional(), modelId: z.string().min(1).optional(), usage: TokenUsageSchema.optional() }),
]);
export type CanonicalEvent = z.infer<typeof CanonicalEventSchema>;

export const StreamInvalidatedSchema = z.strictObject({
  type: z.literal('stream.invalidated'),
  sessionId: EntityIdSchema,
  epoch: EpochSchema,
  reason: z.enum(['EPOCH_CHANGED', 'REPLAY_UNAVAILABLE', 'DELIVERY_OVERFLOW']),
});
export type StreamInvalidated = z.infer<typeof StreamInvalidatedSchema>;
