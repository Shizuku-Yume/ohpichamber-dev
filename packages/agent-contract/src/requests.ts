import { z } from 'zod';
import { EntityIdSchema, EpochSchema, JsonObjectSchema, JsonValueSchema, PositiveCounterSchema, CounterSchema, TimestampSchema } from './primitives.ts';

export const RequestCASSchema = z.strictObject({
  version: PositiveCounterSchema, epoch: EpochSchema, workerGeneration: EntityIdSchema,
});
export type RequestCAS = z.infer<typeof RequestCASSchema>;
export const ApprovalDecisionSchema = z.discriminatedUnion('decision', [
  z.strictObject({ decision: z.literal('approve') }),
  z.strictObject({ decision: z.literal('reject') }),
  z.strictObject({ decision: z.literal('always-allow'), policyScope: z.literal('session') }),
  z.strictObject({ decision: z.literal('always-deny'), policyScope: z.literal('workspace') }),
]);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
export const ApprovalReplySchema = z.discriminatedUnion('decision', [
  RequestCASSchema.extend({ decision: z.literal('approve') }),
  RequestCASSchema.extend({ decision: z.literal('reject') }),
  RequestCASSchema.extend({ decision: z.literal('always-allow'), policyScope: z.literal('session') }),
  RequestCASSchema.extend({ decision: z.literal('always-deny'), policyScope: z.literal('workspace') }),
]);
export type ApprovalReply = z.infer<typeof ApprovalReplySchema>;
const committedPolicyFields = { policyId: EntityIdSchema, revision: CounterSchema, persistence: z.literal('committed') };
const sessionPolicyFields = z.union([
  z.strictObject({ ...committedPolicyFields, scope: z.literal('session') }),
  z.strictObject({ scope: z.literal('session'), persistence: z.literal('ephemeral') }),
]);
export const ApprovalResolutionSchema = z.discriminatedUnion('decision', [
  z.strictObject({ decision: z.literal('approve') }),
  z.strictObject({ decision: z.literal('reject') }),
  z.strictObject({ decision: z.literal('always-allow'), policy: sessionPolicyFields }),
  z.strictObject({ decision: z.literal('always-deny'), policy: z.strictObject({ ...committedPolicyFields, scope: z.literal('workspace') }) }),
]);
export type ApprovalResolution = z.infer<typeof ApprovalResolutionSchema>;
export const ApprovalRequestSchema = RequestCASSchema.extend({
  approvalId: EntityIdSchema, sessionId: EntityIdSchema, turnId: EntityIdSchema, toolCallId: EntityIdSchema,
  toolName: z.string().min(1), actionType: z.enum(['bash_command', 'file_write', 'network_request', 'custom_tool']),
  commandSummary: z.string(), details: JsonObjectSchema,
  /** Set when the request originated inside a subagent's tool call, so surfaces can resolve it to that row. */
  subagentId: EntityIdSchema.optional(), childSessionId: EntityIdSchema.optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'revoked', 'expired']),
  requestedAt: TimestampSchema, resolvedAt: TimestampSchema.optional(), resolvedBy: EntityIdSchema.optional(),
  policyTarget: z.strictObject({ toolName: z.string().min(1), pattern: z.string() }).optional(),
  resolution: ApprovalResolutionSchema.optional(),
}).superRefine((request, context) => {
  if (request.status === 'pending') {
    if (request.version !== '1' || request.resolvedAt !== undefined || request.resolvedBy !== undefined || request.resolution !== undefined) {
      context.addIssue({ code: 'custom', message: 'Pending approval must be unresolved at initial version 1' });
    }
    return;
  }
  if (request.version === '1' || request.resolvedAt === undefined) {
    context.addIssue({ code: 'custom', message: 'Terminal approval must advance version and record resolution time' });
  }
  if (request.status === 'approved' || request.status === 'rejected') {
    const decision = request.resolution?.decision;
    const approved = decision === 'approve' || decision === 'always-allow';
    const rejected = decision === 'reject' || decision === 'always-deny';
    if ((request.status === 'approved' && !approved) || (request.status === 'rejected' && !rejected)) {
      context.addIssue({ code: 'custom', message: 'Approval status must match its resolution', path: ['resolution'] });
    }
  }
  if ((request.resolution?.decision === 'always-allow' || request.resolution?.decision === 'always-deny') && request.policyTarget === undefined) {
    context.addIssue({ code: 'custom', message: 'Policy resolution requires the authorized request target', path: ['policyTarget'] });
  }
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export const ApprovalGrantSchema = z.strictObject({
  approvalId: EntityIdSchema,
  toolCallId: EntityIdSchema,
  rootSessionId: EntityIdSchema,
  workerGeneration: EntityIdSchema,
  epoch: EntityIdSchema,
  command: z.string().min(1).optional(),
  toolName: z.string().min(1).optional(),
  input: JsonObjectSchema.optional(),
});
export type ApprovalGrant = z.infer<typeof ApprovalGrantSchema>;
export const PlanReferenceSchema = z.string().regex(/^local:\/\/[^\s?#]+$/).refine(value => !value.includes('..') && !value.includes('\\'), 'Plan reference must remain session-local');
export const PlanReviewSchema = z.strictObject({
  type: z.literal('plan-review'),
  title: z.string().min(1),
  planReference: PlanReferenceSchema,
  planText: z.string().min(1),
});
export type PlanReview = z.infer<typeof PlanReviewSchema>;
const ExecutionModelSelectionSchema = z.strictObject({
  providerId: EntityIdSchema,
  modelId: EntityIdSchema,
});
export const PlanReviewResponseSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('approve'), executionModel: ExecutionModelSelectionSchema.optional() }),
  z.strictObject({ action: z.literal('approve-compact'), executionModel: ExecutionModelSelectionSchema.optional() }),
  z.strictObject({ action: z.literal('feedback'), feedback: z.string().trim().min(1) }),
  z.strictObject({ action: z.literal('reject') }),
]);
export type PlanReviewResponse = z.infer<typeof PlanReviewResponseSchema>;

export const QuestionReplySchema = z.discriminatedUnion('action', [
  RequestCASSchema.extend({ action: z.literal('answer'), response: JsonValueSchema }),
  RequestCASSchema.extend({ action: z.literal('cancel') }),
  RequestCASSchema.extend({ action: z.literal('update'), response: JsonValueSchema }),
]);
export type QuestionReply = z.infer<typeof QuestionReplySchema>;
export const QuestionRequestSchema = RequestCASSchema.extend({
  questionId: EntityIdSchema, sessionId: EntityIdSchema, turnId: EntityIdSchema, prompt: z.string(),
  /** Set when the question originated inside a subagent session. */
  subagentId: EntityIdSchema.optional(), childSessionId: EntityIdSchema.optional(),
  schema: JsonObjectSchema.optional(), status: z.enum(['pending', 'answered', 'cancelled', 'expired']),
  response: JsonValueSchema.optional(), requestedAt: TimestampSchema, answeredAt: TimestampSchema.optional(),
  timeoutResetAt: TimestampSchema.optional(),
  resolvedAt: TimestampSchema.optional(), resolvedBy: EntityIdSchema.optional(),
}).superRefine((request, context) => {
  if (request.schema?.type === 'plan-review') {
    const review = PlanReviewSchema.safeParse(request.schema);
    if (!review.success) context.addIssue({ code: 'custom', message: 'Invalid plan review question', path: ['schema'] });
    if (request.status === 'answered' && !PlanReviewResponseSchema.safeParse(request.response).success) {
      context.addIssue({ code: 'custom', message: 'Invalid plan review response', path: ['response'] });
    }
  }
  if (request.status === 'pending') {
    const updatedForm = request.schema?.type === 'omp.ask' && request.schema.form === true && request.timeoutResetAt !== undefined;
    if ((request.version !== '1' && !updatedForm) || request.response !== undefined || request.answeredAt !== undefined || request.resolvedAt !== undefined || request.resolvedBy !== undefined) {
      context.addIssue({ code: 'custom', message: 'Pending question must be unresolved; only form drafts may advance version' });
    }
    return;
  }
  if (request.version === '1' || request.resolvedAt === undefined) {
    context.addIssue({ code: 'custom', message: 'Terminal question must advance version and record resolution time' });
  }
  if (request.status === 'answered') {
    if (request.response === undefined || request.answeredAt === undefined) {
      context.addIssue({ code: 'custom', message: 'Answered question requires its JSON response and answer time' });
    }
  } else if (request.response !== undefined || request.answeredAt !== undefined) {
    context.addIssue({ code: 'custom', message: 'Cancelled or expired question cannot contain an answer' });
  }
});
export type QuestionRequest = z.infer<typeof QuestionRequestSchema>;

/**
 * Per-subagent control actions. `subagent.revive` brings a `parked`
 * subagent back through OMP's lifecycle manager and, when a message is
 * supplied, immediately hands it that instruction.
 */
export const SubagentControlRequestSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('subagent.steer'), subagentId: EntityIdSchema, message: z.string().min(1) }),
  z.strictObject({ type: z.literal('subagent.cancel'), subagentId: EntityIdSchema }),
  z.strictObject({ type: z.literal('subagent.revive'), subagentId: EntityIdSchema, message: z.string().min(1).optional() }),
]);
export type SubagentControlRequest = z.infer<typeof SubagentControlRequestSchema>;
export const SubagentControlAckSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('subagent.steer'), subagentId: EntityIdSchema, accepted: z.boolean() }),
  z.strictObject({ type: z.literal('subagent.cancel'), subagentId: EntityIdSchema, cancelled: z.boolean() }),
  z.strictObject({ type: z.literal('subagent.revive'), subagentId: EntityIdSchema, revived: z.boolean(), prompted: z.boolean() }),
]);
export type SubagentControlAck = z.infer<typeof SubagentControlAckSchema>;
