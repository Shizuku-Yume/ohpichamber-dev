import { z } from 'zod';
import { EntityIdSchema, JsonObjectSchema, JsonValueSchema, TimestampSchema } from './primitives.ts';
import { PromptAttachmentSchema } from './prompt.ts';

export const TurnStatusSchema = z.enum(['pending', 'running', 'awaiting_approval', 'awaiting_input', 'completed', 'failed', 'cancelled']);
export type TurnStatus = z.infer<typeof TurnStatusSchema>;
export const TurnSchema = z.strictObject({
  turnId: EntityIdSchema, sessionId: EntityIdSchema, runId: EntityIdSchema,
  status: TurnStatusSchema, userMessageId: EntityIdSchema, assistantMessageIds: z.array(EntityIdSchema),
  startedAt: TimestampSchema, finishedAt: TimestampSchema.optional(), error: z.string().optional(),
});
export type Turn = z.infer<typeof TurnSchema>;
export const ToolStatusSchema = z.enum(['pending_approval', 'approved', 'running', 'completed', 'failed', 'denied', 'cancelled']);
export type ToolStatus = z.infer<typeof ToolStatusSchema>;
export const TextPartSchema = z.strictObject({ type: z.literal('text'), partId: EntityIdSchema, content: z.string() });
export type TextPart = z.infer<typeof TextPartSchema>;
export const ReasoningPartSchema = z.strictObject({
  type: z.literal('reasoning'), partId: EntityIdSchema, content: z.string(), signature: z.string().optional(),
});
export type ReasoningPart = z.infer<typeof ReasoningPartSchema>;
export const ToolCallPartSchema = z.strictObject({
  type: z.literal('tool_call'), partId: EntityIdSchema, toolCallId: EntityIdSchema, toolName: z.string().min(1),
  input: JsonObjectSchema, status: ToolStatusSchema, approvalId: EntityIdSchema.optional(),
});
export type ToolCallPart = z.infer<typeof ToolCallPartSchema>;
export const ToolResultPartSchema = z.strictObject({
  type: z.literal('tool_result'), partId: EntityIdSchema, toolCallId: EntityIdSchema, toolName: z.string().min(1),
  output: JsonValueSchema.optional(), error: z.string().optional(), isError: z.boolean(),
});
export type ToolResultPart = z.infer<typeof ToolResultPartSchema>;
export const AttachmentPartSchema = PromptAttachmentSchema.safeExtend({ type: z.literal('attachment'), partId: EntityIdSchema });
export type AttachmentPart = z.infer<typeof AttachmentPartSchema>;
export const StepSummaryPartSchema = z.strictObject({
  type: z.literal('step_summary'), partId: EntityIdSchema, title: z.string(), durationMs: z.number().finite().nonnegative().optional(),
});
export type StepSummaryPart = z.infer<typeof StepSummaryPartSchema>;
export const PartSchema = z.discriminatedUnion('type', [
  TextPartSchema, ReasoningPartSchema, ToolCallPartSchema, ToolResultPartSchema, AttachmentPartSchema, StepSummaryPartSchema,
]);
export type Part = z.infer<typeof PartSchema>;
export const TokenUsageCostSchema = z.strictObject({
  input: z.number().finite().nonnegative(), output: z.number().finite().nonnegative(),
  cacheRead: z.number().finite().nonnegative(), cacheWrite: z.number().finite().nonnegative(),
  total: z.number().finite().nonnegative(),
});
export type TokenUsageCost = z.infer<typeof TokenUsageCostSchema>;
export const TokenUsageSchema = z.strictObject({
  input: z.number().int().nonnegative(), output: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(), cacheWrite: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(), cost: TokenUsageCostSchema,
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const MessageSchema = z.strictObject({
  messageId: EntityIdSchema, sessionId: EntityIdSchema, turnId: EntityIdSchema,
  role: z.enum(['user', 'assistant', 'system']), createdAt: TimestampSchema, parts: z.array(PartSchema),
  providerId: z.string().min(1).optional(), modelId: z.string().min(1).optional(), usage: TokenUsageSchema.optional(),
});
export type Message = z.infer<typeof MessageSchema>;
