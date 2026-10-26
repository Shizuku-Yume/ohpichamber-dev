import { z } from 'zod';
import { CounterSchema, EntityIdSchema, EpochSchema, PositiveCounterSchema, TimestampSchema } from './primitives.ts';
import { CapturedSendOptionsSchema, PromptAttachmentSchema, PromptRequestSchema } from './prompt.ts';
import { SessionMetadataSchema } from './metadata.ts';

export const DisplayPathSchema = z.string().min(1).refine(
  (value) => !value.startsWith('/') && !value.startsWith('\\') && !/^[A-Za-z]:/.test(value),
  { message: 'Display path must be project-relative, never a Host absolute path' },
);
export const WorkspaceSchema = z.strictObject({
  workspaceId: EntityIdSchema,
  projectId: EntityIdSchema,
  name: z.string().min(1),
  displayPath: DisplayPathSchema.optional(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;
export const DiscoveryErrorsSchema = z.record(EntityIdSchema, z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/));
export const WorkspaceListSchema = z.strictObject({
  items: z.array(WorkspaceSchema),
  errors: DiscoveryErrorsSchema,
});
export type WorkspaceList = z.infer<typeof WorkspaceListSchema>;
export const ProjectSchema = z.strictObject({
  projectId: EntityIdSchema, name: z.string(), workspaceIds: z.array(EntityIdSchema),
  displayPath: DisplayPathSchema.optional(),
});
export type Project = z.infer<typeof ProjectSchema>;
export const ProjectListSchema = z.strictObject({
  items: z.array(ProjectSchema),
  errors: DiscoveryErrorsSchema,
});
export type ProjectList = z.infer<typeof ProjectListSchema>;
export const AgentSchema = z.strictObject({
  agentId: EntityIdSchema, name: z.string().min(1), description: z.string(),
  model: z.strictObject({ providerId: EntityIdSchema, modelId: EntityIdSchema }).nullable(),
  allowedTools: z.array(z.string().min(1)).nullable(),
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
export const SessionModeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('main') }),
  z.strictObject({
    kind: z.literal('plan'), status: z.enum(['active', 'paused']),
    planReference: z.string().regex(/^local:\/\/[^\s]+$/, 'Plan references must use local:// URLs'),
  }),
  z.strictObject({ kind: z.literal('vibe') }),
  z.strictObject({
    kind: z.literal('goal'), status: z.enum(['active', 'paused', 'budget-limited', 'complete']),
    objective: z.string().min(1), tokenBudget: z.number().int().positive().nullable(), tokensUsed: z.number().int().nonnegative(),
  }),
]);
export type SessionMode = z.infer<typeof SessionModeSchema>;
export const RuntimeSessionSchema = z.strictObject({
  sessionId: EntityIdSchema, projectId: EntityIdSchema, workspaceId: EntityIdSchema, displayPath: DisplayPathSchema,
  parentSessionId: EntityIdSchema.optional(), rootSessionId: EntityIdSchema,
  createdAt: TimestampSchema, updatedAt: TimestampSchema, epoch: EpochSchema, headSequence: CounterSchema,
  runtimeStatus: SessionRuntimeStatusSchema, activeRunId: EntityIdSchema.nullable(),
  mode: SessionModeSchema,
  continuationPending: z.boolean().optional(),
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
export const RunOriginSchema = z.enum(['host', 'plan', 'goal']);
export type RunOrigin = z.infer<typeof RunOriginSchema>;
export const RunSchema = z.strictObject({
  runId: EntityIdSchema, sessionId: EntityIdSchema,
  status: RunStatusSchema, origin: RunOriginSchema.default('host'), createdAt: TimestampSchema, finishedAt: TimestampSchema.optional(), error: z.string().optional(),
}).refine((run) => {
  const terminal = run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';
  return terminal === (run.finishedAt !== undefined);
}, { message: 'Only outer terminal runs have a finish time', path: ['finishedAt'] });
export type Run = z.infer<typeof RunSchema>;
export const SubagentSchema = z.strictObject({
  subagentId: EntityIdSchema, parentSessionId: EntityIdSchema, childSessionId: EntityIdSchema,
  toolCallId: EntityIdSchema.optional(),
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
export const GoalControlRequestSchema = z.strictObject({
  type: z.literal('goal'), op: z.enum(['create', 'resume', 'pause', 'drop']), objective: z.string().trim().min(1).optional(), tokenBudget: z.number().int().positive().nullable().optional(),
  providerId: EntityIdSchema.optional(), modelId: EntityIdSchema.optional(), variant: z.string().nullable().optional(), reasoningEffort: z.string().nullable().optional(),
}).refine(request => request.op !== 'create' || request.objective !== undefined, {
  message: 'Goal creation requires an objective', path: ['objective'],
});
export type GoalControlRequest = z.infer<typeof GoalControlRequestSchema>;
export const SessionControlRequestSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('abort'), runId: EntityIdSchema }),
  z.strictObject({ type: z.literal('mode.set'), mode: z.enum(['main', 'plan', 'vibe']) }),
  GoalControlRequestSchema,
  z.strictObject({ type: z.literal('compact'), instructions: z.string().optional() }),
  z.strictObject({ type: z.literal('command'), text: z.string().min(1) }),
  z.strictObject({ type: z.literal('btw.ask'), question: z.string().min(1), recordId: EntityIdSchema.optional() }),
  z.strictObject({ type: z.literal('btw.cancel'), recordId: EntityIdSchema.optional() }),
]);
export type SessionControlRequest = z.infer<typeof SessionControlRequestSchema>;
export const SessionControlAckSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('mode.set'), mode: SessionModeSchema }),
  z.strictObject({ type: z.literal('goal'), mode: SessionModeSchema }),
  z.strictObject({ type: z.literal('compact'), compactionId: EntityIdSchema, tokensBefore: z.number().int().nonnegative(), completedAt: TimestampSchema }),
  z.strictObject({ type: z.literal('command'), output: z.string() }),
  z.strictObject({ type: z.literal('btw.ask'), recordId: EntityIdSchema }),
  z.strictObject({ type: z.literal('btw.cancel'), cancelled: z.boolean() }),
]);
export type SessionControlAck = z.infer<typeof SessionControlAckSchema>;
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

export const SessionBranchStateSchema = z.strictObject({
  branchId: EntityIdSchema, branchVersion: CounterSchema, leafMessageId: EntityIdSchema.nullable(),
  revert: z.strictObject({ messageId: EntityIdSchema }).optional(),
});
export type SessionBranchState = z.infer<typeof SessionBranchStateSchema>;
const BranchOwnerSchema = z.strictObject({ branchId: EntityIdSchema, branchVersion: CounterSchema });
export const SessionBranchRequestSchema = z.discriminatedUnion('action', [
  BranchOwnerSchema.extend({ action: z.literal('revert'), messageId: EntityIdSchema }),
  BranchOwnerSchema.extend({ action: z.literal('restore') }),
]);
export type SessionBranchRequest = z.infer<typeof SessionBranchRequestSchema>;
export const SessionBranchResultSchema = z.strictObject({
  sessionId: EntityIdSchema,
  branch: SessionBranchStateSchema,
  draft: z.strictObject({ text: z.string(), attachments: z.array(PromptAttachmentSchema) }).nullable(),
});
export type SessionBranchResult = z.infer<typeof SessionBranchResultSchema>;
export const SessionRelocateRequestSchema = z.strictObject({ workspaceId: EntityIdSchema });
export type SessionRelocateRequest = z.infer<typeof SessionRelocateRequestSchema>;
export const SessionRelocateResultSchema = z.strictObject({ sessions: z.array(SessionSchema).min(1) });
export type SessionRelocateResult = z.infer<typeof SessionRelocateResultSchema>;
