import { z } from 'zod';
import { CounterSchema, EntityIdSchema, EpochSchema, JsonObjectSchema, JsonValueSchema, PositiveCounterSchema, TimestampSchema } from './primitives.ts';
import { SessionMetadataSchema } from './metadata.ts';
import { CompactionMethodSchema, LoopStateSchema, RunOriginSchema, RuntimeSessionSchema, SessionModeSchema, SessionRuntimeStatusSchema, SubagentSchema, TodoPhaseSchema } from './session.ts';
import { PartSchema, StepTimingSchema, TokenUsageSchema, ToolStatusSchema } from './messages.ts';
import { ApprovalRequestSchema, QuestionRequestSchema } from './requests.ts';
import { QueueStateSchema } from './queue.ts';
import { CatalogUpdateSchema } from './catalogs.ts';
import { ShellJobSchema } from './shell.ts';
import { SessionCompactingSchema, SessionSelectionSchema } from './snapshot.ts';

export const DataEventEnvelopeSchema = z.strictObject({
  sessionId: EntityIdSchema,
  epoch: EpochSchema,
  sequence: PositiveCounterSchema,
  timestamp: TimestampSchema,
});
export type DataEventEnvelope = z.infer<typeof DataEventEnvelopeSchema>;

export const SessionUpdatedPayloadSchema = z.strictObject({
  type: z.literal('session.updated'),
  session: RuntimeSessionSchema.optional(),
  mode: SessionModeSchema.optional(),
  title: z.string().min(1).optional(),
  continuationPending: z.boolean().optional(),
  loop: LoopStateSchema.optional(),
  selection: SessionSelectionSchema.optional(),
  compacting: SessionCompactingSchema.nullable().optional(),
  todos: z.array(TodoPhaseSchema).optional(),
  metadata: SessionMetadataSchema.nullable().optional(),
  metadataRevision: CounterSchema.optional(),
  archivedAt: TimestampSchema.nullable().optional(),
  archiveRevision: CounterSchema.optional(),
}).refine((event) => {
  const metadataPresent = event.metadata !== undefined;
  const archivePresent = event.archivedAt !== undefined;
  return (event.session !== undefined || event.mode !== undefined || event.title !== undefined
    || event.continuationPending !== undefined || event.loop !== undefined || event.selection !== undefined
    || event.compacting !== undefined || event.todos !== undefined || metadataPresent || archivePresent)
    && metadataPresent === (event.metadataRevision !== undefined)
    && archivePresent === (event.archiveRevision !== undefined)
    && (!metadataPresent || (event.metadata === null) === (event.metadataRevision === '0'));
}, { message: 'Host projections require their exact independent revisions' });

const sessionUpdatedSchema = SessionUpdatedPayloadSchema.safeExtend(DataEventEnvelopeSchema.shape);

export const SessionStatusPayloadSchema = z.strictObject({
  type: z.literal('session.status'),
  runtimeStatus: SessionRuntimeStatusSchema,
  activeRunId: EntityIdSchema.nullable(),
}).refine((event) => (event.runtimeStatus === 'idle' || event.runtimeStatus === 'unavailable') === (event.activeRunId === null), {
  message: 'Runtime status must identify its live outer run',
});
const sessionStatusSchema = SessionStatusPayloadSchema.safeExtend(DataEventEnvelopeSchema.shape);

export const SubagentUpdatedEventSchema = DataEventEnvelopeSchema.extend({
  type: z.literal('subagent.updated'),
  subagent: SubagentSchema,
});
export const AdvisorNoteSchema = z.strictObject({
  noteId: EntityIdSchema,
  severity: z.enum(['nit', 'concern', 'blocker']),
  text: z.string().min(1),
  turnId: EntityIdSchema.optional(),
  advisorName: z.string().optional(),
  timestamp: TimestampSchema,
});
export type AdvisorNote = z.infer<typeof AdvisorNoteSchema>;
export const AdvisorYieldedEventSchema = DataEventEnvelopeSchema.extend({
  type: z.literal('advisor_yielded'),
  notes: z.array(AdvisorNoteSchema),
});
export type AdvisorYieldedEvent = z.infer<typeof AdvisorYieldedEventSchema>;
/** A native idle recap, published once OMP's `IdleMaintenance` records it. */
export const SessionRecapEventSchema = DataEventEnvelopeSchema.extend({
  type: z.literal('session.recap'),
  recap: z.string().min(1),
  createdAt: TimestampSchema,
});
export type SessionRecapEvent = z.infer<typeof SessionRecapEventSchema>;
/** A next-prompt suggestion, published once the worker completes an ephemeral prediction turn. */
export const SessionSuggestionEventSchema = DataEventEnvelopeSchema.extend({
  type: z.literal('session.suggestion'),
  suggestion: z.string().min(1),
  createdAt: TimestampSchema,
});
export type SessionSuggestionEvent = z.infer<typeof SessionSuggestionEventSchema>;
export const CleanseProgressEventSchema = DataEventEnvelopeSchema.extend({
  type: z.literal('cleanse.progress'),
  activeCheckers: z.array(z.string()),
  completedCheckers: z.array(z.string()),
  repairedFiles: z.array(z.string()),
  diagnosticsCount: z.number().int().nonnegative().optional(),
  status: z.enum(['discovering', 'repairing', 'verifying', 'completed', 'failed', 'cancelled']),
  summary: z.string().optional(),
});
export type CleanseProgressEvent = z.infer<typeof CleanseProgressEventSchema>;
export type CleanseProgressStatus = CleanseProgressEvent['status'];
export const CanonicalEventSchema = z.discriminatedUnion('type', [
  sessionUpdatedSchema,
  DataEventEnvelopeSchema.extend({ type: z.literal('session.deleted'), deletedSessionIds: z.array(EntityIdSchema).min(1) }),
  sessionStatusSchema,
  DataEventEnvelopeSchema.extend({ type: z.literal('run.started'), runId: EntityIdSchema, origin: RunOriginSchema.optional(), createdAt: TimestampSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('run.completed'), runId: EntityIdSchema, finishedAt: TimestampSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('run.failed'), runId: EntityIdSchema, finishedAt: TimestampSchema, error: z.string() }),
  DataEventEnvelopeSchema.extend({ type: z.literal('run.cancelled'), runId: EntityIdSchema, finishedAt: TimestampSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('turn.started'), turnId: EntityIdSchema, runId: EntityIdSchema, userMessageId: EntityIdSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('turn.completed'), turnId: EntityIdSchema, runId: EntityIdSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('message.created'), messageId: EntityIdSchema, turnId: EntityIdSchema, role: z.enum(['user', 'assistant', 'system']), providerId: z.string().min(1).optional(), modelId: z.string().min(1).optional(), usage: TokenUsageSchema.optional(), timing: StepTimingSchema.optional() }),
  DataEventEnvelopeSchema.extend({ type: z.literal('part.started'), messageId: EntityIdSchema, part: PartSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('part.updated'), part: PartSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('part.delta'), partId: EntityIdSchema, delta: z.string() }),
  DataEventEnvelopeSchema.extend({ type: z.literal('part.completed'), part: PartSchema }),
  DataEventEnvelopeSchema.extend({ type: z.literal('tool.started'), toolCallId: EntityIdSchema, toolName: z.string().min(1), input: JsonObjectSchema }),
  DataEventEnvelopeSchema.extend({
    type: z.literal('tool.completed'), toolCallId: EntityIdSchema,
    status: ToolStatusSchema.extract(['completed', 'failed', 'denied', 'cancelled']),
    isError: z.boolean(), output: JsonValueSchema.optional(), error: z.string().optional(), errorKind: z.string().min(1).optional(),
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
  DataEventEnvelopeSchema.extend({ type: z.literal('btw.delta'), recordId: EntityIdSchema, delta: z.string() }),
  DataEventEnvelopeSchema.extend({ type: z.literal('btw.completed'), recordId: EntityIdSchema, status: z.enum(['completed', 'cancelled', 'failed']), text: z.string(), error: z.string().optional() }),
  DataEventEnvelopeSchema.extend({ type: z.literal('shell.updated'), job: ShellJobSchema }),
  DataEventEnvelopeSchema.extend({
    type: z.literal('session.compacted'),
    compactionId: EntityIdSchema,
    method: CompactionMethodSchema.optional(),
    tokensBefore: z.number().int().nonnegative(),
    tokensAfter: z.number().int().nonnegative().optional(),
    summary: z.string().optional(),
    warning: z.string().optional(),
    completedAt: TimestampSchema,
  }),
  DataEventEnvelopeSchema.extend({ type: z.literal('message.updated'), messageId: EntityIdSchema, providerId: z.string().min(1).optional(), modelId: z.string().min(1).optional(), usage: TokenUsageSchema.optional(), timing: StepTimingSchema.optional() }),
  SubagentUpdatedEventSchema,
  SessionRecapEventSchema,
  SessionSuggestionEventSchema,
  AdvisorYieldedEventSchema,
  CleanseProgressEventSchema,
]);
export type CanonicalEvent = z.infer<typeof CanonicalEventSchema>;

export const StreamInvalidatedSchema = z.strictObject({
  type: z.literal('stream.invalidated'),
  sessionId: EntityIdSchema,
  epoch: EpochSchema,
  reason: z.enum(['EPOCH_CHANGED', 'REPLAY_UNAVAILABLE', 'DELIVERY_OVERFLOW']),
});
export type StreamInvalidated = z.infer<typeof StreamInvalidatedSchema>;
