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
export const ApprovalResolutionSchema = z.discriminatedUnion('decision', [
  z.strictObject({ decision: z.literal('approve') }),
  z.strictObject({ decision: z.literal('reject') }),
  z.strictObject({ decision: z.literal('always-allow'), policy: z.strictObject({ ...committedPolicyFields, scope: z.literal('session') }) }),
  z.strictObject({ decision: z.literal('always-deny'), policy: z.strictObject({ ...committedPolicyFields, scope: z.literal('workspace') }) }),
]);
export type ApprovalResolution = z.infer<typeof ApprovalResolutionSchema>;
export const ApprovalRequestSchema = RequestCASSchema.extend({
  approvalId: EntityIdSchema, sessionId: EntityIdSchema, turnId: EntityIdSchema, toolCallId: EntityIdSchema,
  toolName: z.string().min(1), actionType: z.enum(['bash_command', 'file_write', 'network_request', 'custom_tool']),
  commandSummary: z.string(), details: JsonObjectSchema,
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
export const QuestionReplySchema = z.discriminatedUnion('action', [
  RequestCASSchema.extend({ action: z.literal('answer'), response: JsonValueSchema }),
  RequestCASSchema.extend({ action: z.literal('cancel') }),
]);
export type QuestionReply = z.infer<typeof QuestionReplySchema>;
export const QuestionRequestSchema = RequestCASSchema.extend({
  questionId: EntityIdSchema, sessionId: EntityIdSchema, turnId: EntityIdSchema, prompt: z.string(),
  schema: JsonObjectSchema.optional(), status: z.enum(['pending', 'answered', 'cancelled', 'expired']),
  response: JsonValueSchema.optional(), requestedAt: TimestampSchema, answeredAt: TimestampSchema.optional(),
  resolvedAt: TimestampSchema.optional(), resolvedBy: EntityIdSchema.optional(),
}).superRefine((request, context) => {
  if (request.status === 'pending') {
    if (request.version !== '1' || request.response !== undefined || request.answeredAt !== undefined || request.resolvedAt !== undefined || request.resolvedBy !== undefined) {
      context.addIssue({ code: 'custom', message: 'Pending question must be unresolved at initial version 1' });
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
