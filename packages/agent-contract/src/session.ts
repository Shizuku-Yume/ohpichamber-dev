import { z } from 'zod';
import { CounterSchema, EntityIdSchema, EpochSchema, PositiveCounterSchema, TimestampSchema } from './primitives.ts';
import { CapturedSendOptionsSchema, PromptRequestSchema } from './prompt.ts';
import { SessionMetadataSchema } from './metadata.ts';

const displayPathSchema = z.string().min(1).refine(
  (value) => !value.startsWith('/') && !value.startsWith('\\') && !/^[A-Za-z]:/.test(value),
  { message: 'Display path must be project-relative, never a Host absolute path' },
);
export const ProjectSchema = z.strictObject({
  projectId: EntityIdSchema, name: z.string(), workspaceIds: z.array(EntityIdSchema),
  displayPath: displayPathSchema.optional(),
});
export type Project = z.infer<typeof ProjectSchema>;
export const AgentSchema = z.strictObject({
  agentId: EntityIdSchema, name: z.string().min(1), description: z.string(),
  model: z.strictObject({ providerId: EntityIdSchema, modelId: EntityIdSchema }).nullable(),
  allowedTools: z.array(z.string().min(1)),
  systemPromptOverride: z.string().optional(), permissionPresetId: EntityIdSchema.optional(),
});
export type Agent = z.infer<typeof AgentSchema>;
export const AgentCreateRequestSchema = z.strictObject({ expectedRevision: CounterSchema, agent: AgentSchema });
export type AgentCreateRequest = z.infer<typeof AgentCreateRequestSchema>;
export const AgentUpdateRequestSchema = z.strictObject({ expectedRevision: CounterSchema, agent: AgentSchema });
export type AgentUpdateRequest = z.infer<typeof AgentUpdateRequestSchema>;
export const AgentDeleteRequestSchema = z.strictObject({ expectedRevision: CounterSchema, agentId: EntityIdSchema });
export type AgentDeleteRequest = z.infer<typeof AgentDeleteRequestSchema>;
export const AgentMutationResultSchema = z.strictObject({
  revision: PositiveCounterSchema, agentId: EntityIdSchema, agent: AgentSchema.nullable(),
}).refine((result) => result.agent === null || result.agent.agentId === result.agentId, {
  message: 'Agent mutation result must identify the affected profile', path: ['agentId'],
});
export type AgentMutationResult = z.infer<typeof AgentMutationResultSchema>;
export const SessionRuntimeStatusSchema = z.enum(['idle', 'running', 'awaiting_approval', 'awaiting_input', 'unavailable']);
export type SessionRuntimeStatus = z.infer<typeof SessionRuntimeStatusSchema>;
export const RuntimeSessionSchema = z.strictObject({
  sessionId: EntityIdSchema, projectId: EntityIdSchema, workspaceId: EntityIdSchema, displayPath: displayPathSchema,
  parentSessionId: EntityIdSchema.optional(), rootSessionId: EntityIdSchema,
  createdAt: TimestampSchema, updatedAt: TimestampSchema, epoch: EpochSchema, headSequence: CounterSchema,
  runtimeStatus: SessionRuntimeStatusSchema, activeRunId: EntityIdSchema.nullable(),
}).refine((session) => (session.runtimeStatus === 'idle' || session.runtimeStatus === 'unavailable') === (session.activeRunId === null), {
  message: 'Runtime activity must identify its outer run', path: ['activeRunId'],
});
export type RuntimeSession = z.infer<typeof RuntimeSessionSchema>;
export const SessionSchema = RuntimeSessionSchema.safeExtend({
  archivedAt: TimestampSchema.optional(), metadata: SessionMetadataSchema.nullable(),
  metadataRevision: CounterSchema, archiveRevision: CounterSchema,
}).refine((session) => (session.metadata === null) === (session.metadataRevision === '0'), {
  message: 'Confirmed missing metadata has revision 0', path: ['metadataRevision'],
});
export type Session = z.infer<typeof SessionSchema>;
export const RunStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
export type RunStatus = z.infer<typeof RunStatusSchema>;
export const RunSchema = z.strictObject({
  runId: EntityIdSchema, sessionId: EntityIdSchema,
  status: RunStatusSchema, createdAt: TimestampSchema, finishedAt: TimestampSchema.optional(), error: z.string().optional(),
}).refine((run) => {
  const terminal = run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';
  return terminal === (run.finishedAt !== undefined);
}, { message: 'Only outer terminal runs have a finish time', path: ['finishedAt'] });
export type Run = z.infer<typeof RunSchema>;
export const SubagentSchema = z.strictObject({
  subagentId: EntityIdSchema, parentSessionId: EntityIdSchema, childSessionId: EntityIdSchema,
  role: z.string(), solutionSpace: z.string().optional(), status: z.enum(['idle', 'running', 'completed', 'failed']),
});
export type Subagent = z.infer<typeof SubagentSchema>;
export const SessionCreateRequestSchema = z.strictObject({
  projectId: EntityIdSchema, workspaceId: EntityIdSchema, options: CapturedSendOptionsSchema,
  metadata: SessionMetadataSchema.optional(),
});
export type SessionCreateRequest = z.infer<typeof SessionCreateRequestSchema>;
export const SessionCreateAckSchema = z.strictObject({ session: SessionSchema });
export type SessionCreateAck = z.infer<typeof SessionCreateAckSchema>;
export const SessionDeleteRequestSchema = z.strictObject({
  sessionId: EntityIdSchema, force: z.boolean().optional(), purgeWorkspaceFiles: z.boolean().optional(),
});
export type SessionDeleteRequest = z.infer<typeof SessionDeleteRequestSchema>;
export const SessionDeleteAckSchema = z.strictObject({ sessionId: EntityIdSchema, deletedSessionIds: z.array(EntityIdSchema).min(1) })
  .refine((ack) => ack.deletedSessionIds.includes(ack.sessionId), { message: 'Deletion acknowledgement must include the requested session' });
export type SessionDeleteAck = z.infer<typeof SessionDeleteAckSchema>;
export const RunCreateRequestSchema = PromptRequestSchema;
export type RunCreateRequest = z.infer<typeof RunCreateRequestSchema>;
export const RunAbortRequestSchema = z.strictObject({ sessionId: EntityIdSchema, runId: EntityIdSchema });
export type RunAbortRequest = z.infer<typeof RunAbortRequestSchema>;
export const RunAbortAckSchema = z.strictObject({ run: RunSchema });
export type RunAbortAck = z.infer<typeof RunAbortAckSchema>;
export const SteerRequestSchema = z.strictObject({ sessionId: EntityIdSchema, request: PromptRequestSchema });
export type SteerRequest = z.infer<typeof SteerRequestSchema>;
export const SteerAckSchema = z.strictObject({ sessionId: EntityIdSchema, runId: EntityIdSchema, acceptedAt: TimestampSchema });
export type SteerAck = z.infer<typeof SteerAckSchema>;
export const FollowUpRequestSchema = z.strictObject({ sessionId: EntityIdSchema, request: PromptRequestSchema });
export type FollowUpRequest = z.infer<typeof FollowUpRequestSchema>;
export const FollowUpAckSchema = z.strictObject({ sessionId: EntityIdSchema, followUpId: EntityIdSchema, acceptedAt: TimestampSchema });
export type FollowUpAck = z.infer<typeof FollowUpAckSchema>;
