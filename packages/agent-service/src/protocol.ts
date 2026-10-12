import { CapturedSendOptionsSchema, EntityIdSchema, HistoryPageRequestSchema, HistoryPageSchema, JsonObjectSchema, JsonValueSchema, ProblemCodeSchema, PromptRequestSchema, RunSchema } from '@openchamber/agent-contract';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { ProjectionInputSchema, ProjectionSeedSchema } from './projection/protocol.ts';

const PrivatePathSchema = z.string().min(1).refine(isAbsolute);
const AttachmentReferenceSchema = z.strictObject({ attachmentId: EntityIdSchema, path: PrivatePathSchema });
export const WorkerApprovalPolicySchema = z.strictObject({
  policyId: EntityIdSchema, revision: z.string().regex(/^(0|[1-9][0-9]*)$/),
  scope: z.enum(['session', 'workspace']), decision: z.enum(['allow', 'deny']),
  target: z.strictObject({ toolName: z.string().min(1), pattern: z.string() }),
});
export type WorkerApprovalPolicy = z.infer<typeof WorkerApprovalPolicySchema>;
export const WorkerBootstrapSchema = z.strictObject({
  rootSessionId: EntityIdSchema, projectId: EntityIdSchema, workspaceId: EntityIdSchema,
  cwd: PrivatePathSchema, agentDirectory: PrivatePathSchema,
  sessionsDirectory: PrivatePathSchema.optional(), sessionFile: PrivatePathSchema.optional(),
  options: CapturedSendOptionsSchema.optional(), env: z.record(z.string(), z.string()).optional(),
});
export type WorkerBootstrap = z.infer<typeof WorkerBootstrapSchema>;
export const WorkerBootstrapMessageSchema = WorkerBootstrapSchema.omit({ env: true }).extend({
  type: z.literal('bootstrap'), workerGeneration: EntityIdSchema, approvalPolicies: z.array(WorkerApprovalPolicySchema).optional(),
});
export type WorkerBootstrapMessage = z.infer<typeof WorkerBootstrapMessageSchema>;

export const WorkerOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('prompt'), runId: EntityIdSchema, request: PromptRequestSchema, attachments: z.array(AttachmentReferenceSchema).optional() }),
  z.strictObject({ type: z.literal('abort'), runId: EntityIdSchema }),
  z.strictObject({ type: z.literal('approval.resolve'), approvalId: EntityIdSchema, decision: z.enum(['approve', 'reject']), policy: WorkerApprovalPolicySchema.optional() }),
  z.strictObject({ type: z.literal('question.resolve'), questionId: EntityIdSchema, action: z.enum(['answer', 'cancel']), response: JsonValueSchema.optional() }),
  z.strictObject({ type: z.literal('history'), request: HistoryPageRequestSchema }),
  z.strictObject({ type: z.literal('delete') }),
]);
export type WorkerOperation = z.infer<typeof WorkerOperationSchema>;
const WorkerApprovalInteractionSchema = z.strictObject({
  kind: z.literal('approval'), approvalId: EntityIdSchema, toolCallId: EntityIdSchema, toolName: z.string().min(1),
  actionType: z.enum(['bash_command', 'file_write', 'network_request', 'custom_tool']), commandSummary: z.string(),
  details: JsonObjectSchema, policyTarget: z.strictObject({ toolName: z.string().min(1), pattern: z.string() }), turnId: EntityIdSchema,
});
const WorkerQuestionInteractionSchema = z.strictObject({
  kind: z.literal('question'), questionId: EntityIdSchema, turnId: EntityIdSchema, prompt: z.string(),
  schema: JsonObjectSchema,
});
export const WorkerInteractionSchema = z.discriminatedUnion('kind', [WorkerApprovalInteractionSchema, WorkerQuestionInteractionSchema]);
export type WorkerInteraction = z.infer<typeof WorkerInteractionSchema>;
const WorkerOperationResultSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('prompt'), run: RunSchema }),
  z.strictObject({ type: z.literal('abort'), run: RunSchema }),
  z.strictObject({ type: z.literal('approval.resolve'), resolved: z.literal(true) }),
  z.strictObject({ type: z.literal('question.resolve'), resolved: z.literal(true) }),
  z.strictObject({ type: z.literal('history'), history: HistoryPageSchema }),
  z.strictObject({ type: z.literal('delete'), deletedSessionIds: z.array(EntityIdSchema).min(1) }),
]);
export type WorkerOperationResult = z.infer<typeof WorkerOperationResultSchema>;
const WorkerOperationCommandSchema = z.strictObject({
  type: z.literal('operation'), workerGeneration: EntityIdSchema, commandId: EntityIdSchema, operation: WorkerOperationSchema,
});
export const WorkerCommandSchema = z.discriminatedUnion('type', [
  WorkerBootstrapMessageSchema,
  z.strictObject({ type: z.literal('stop'), workerGeneration: EntityIdSchema }),
  WorkerOperationCommandSchema,
]);
export const WorkerReplySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready'), workerGeneration: EntityIdSchema }),
  z.strictObject({ type: z.literal('error'), workerGeneration: EntityIdSchema, code: ProblemCodeSchema }),
  z.strictObject({ type: z.literal('operation.error'), workerGeneration: EntityIdSchema, commandId: EntityIdSchema, code: ProblemCodeSchema, status: z.number().int().min(400).max(599) }),
  z.strictObject({ type: z.literal('lifecycle'), workerGeneration: EntityIdSchema, state: z.enum(['initialized', 'closed']) }),
  z.strictObject({ type: z.literal('opened'), workerGeneration: EntityIdSchema, sessionFile: PrivatePathSchema, seed: ProjectionSeedSchema }),
  z.strictObject({ type: z.literal('events'), workerGeneration: EntityIdSchema, inputs: z.array(ProjectionInputSchema) }),
  z.strictObject({ type: z.literal('interaction'), workerGeneration: EntityIdSchema, request: WorkerInteractionSchema }),
  z.strictObject({ type: z.literal('result'), workerGeneration: EntityIdSchema, commandId: EntityIdSchema, result: WorkerOperationResultSchema }),
]);
export type WorkerReply = z.infer<typeof WorkerReplySchema>;
const WorkerInfoSchema = z.strictObject({
  rootSessionId: EntityIdSchema, workerGeneration: EntityIdSchema, projectId: EntityIdSchema, workspaceId: EntityIdSchema,
  state: z.enum(['starting', 'ready', 'stopping', 'stopped', 'crashed']),
});
export type WorkerInfo = z.infer<typeof WorkerInfoSchema>;
