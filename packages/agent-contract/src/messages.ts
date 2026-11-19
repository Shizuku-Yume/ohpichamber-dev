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
export const SessionMentionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('session'), sessionId: EntityIdSchema, title: z.string(), messageId: EntityIdSchema.optional() }),
  z.strictObject({ kind: z.literal('session-message'), sessionId: EntityIdSchema, messageId: EntityIdSchema, sessionTitle: z.string(), excerpt: z.string() }),
]);
export type SessionMention = z.infer<typeof SessionMentionSchema>;
export const TextPartSchema = z.strictObject({ type: z.literal('text'), partId: EntityIdSchema, content: z.string(), sessionMentions: z.array(SessionMentionSchema).optional() });
export type TextPart = z.infer<typeof TextPartSchema>;
export const ReasoningPartSchema = z.strictObject({
  type: z.literal('reasoning'), partId: EntityIdSchema, content: z.string(), signature: z.string().optional(),
});
export type ReasoningPart = z.infer<typeof ReasoningPartSchema>;
export const EditPreviewFileSchema = z.strictObject({
  path: z.string().min(1),
  diff: z.string().optional(),
  firstChangedLine: z.number().int().optional(),
  error: z.string().optional(),
  op: z.string().optional(),
  rename: z.string().optional(),
});
export type EditPreviewFile = z.infer<typeof EditPreviewFileSchema>;

export const EditPreviewSchema = z.strictObject({
  files: z.array(EditPreviewFileSchema),
  streaming: z.boolean().optional(),
  generation: z.number().optional(),
});
export type EditPreview = z.infer<typeof EditPreviewSchema>;

export const ToolCallPartSchema = z.strictObject({
  type: z.literal('tool_call'), partId: EntityIdSchema, toolCallId: EntityIdSchema, toolName: z.string().min(1),
  input: JsonObjectSchema, status: ToolStatusSchema, approvalId: EntityIdSchema.optional(),
  editPreview: EditPreviewSchema.optional(),
});
export type ToolCallPart = z.infer<typeof ToolCallPartSchema>;
export const ToolResultPartSchema = z.strictObject({
  type: z.literal('tool_result'), partId: EntityIdSchema, toolCallId: EntityIdSchema, toolName: z.string().min(1),
  output: JsonValueSchema.optional(), error: z.string().optional(), isError: z.boolean(),
  /** Machine-readable failure class (`timeout`, `background-job`, `interrupted`, …) beside the human detail in `error`. */
  errorKind: z.string().min(1).optional(),
});
export type ToolResultPart = z.infer<typeof ToolResultPartSchema>;
export const AttachmentPartSchema = PromptAttachmentSchema.safeExtend({ type: z.literal('attachment'), partId: EntityIdSchema });
export type AttachmentPart = z.infer<typeof AttachmentPartSchema>;
export const StepSummaryPartSchema = z.strictObject({
  type: z.literal('step_summary'), partId: EntityIdSchema, title: z.string(), durationMs: z.number().finite().nonnegative().optional(),
});
export type StepSummaryPart = z.infer<typeof StepSummaryPartSchema>;
export const TodoNoticePartSchema = z.strictObject({
  type: z.literal('notice'),
  partId: EntityIdSchema,
  noticeType: z.literal('todo_reminder'),
  level: z.enum(['info', 'warning', 'error']),
  title: z.string().optional(),
  message: z.string().optional(),
  details: z.strictObject({
    attempt: z.number().int().positive(),
    maxAttempts: z.number().int().positive(),
    todos: z.array(z.strictObject({
      content: z.string(),
      status: z.enum(['pending', 'in_progress', 'completed', 'abandoned']),
    })),
  }),
});

export const TtsrNoticePartSchema = z.strictObject({
  type: z.literal('notice'),
  partId: EntityIdSchema,
  noticeType: z.literal('ttsr_triggered'),
  level: z.enum(['info', 'warning', 'error']),
  title: z.string().optional(),
  message: z.string().optional(),
  details: z.strictObject({
    rules: z.array(z.strictObject({
      name: z.string(),
      description: z.string().optional(),
    })),
  }),
});

export const AutoRetryNoticePartSchema = z.strictObject({
  type: z.literal('notice'),
  partId: EntityIdSchema,
  noticeType: z.literal('auto_retry_start'),
  level: z.enum(['info', 'warning', 'error']),
  title: z.string().optional(),
  message: z.string().optional(),
  details: z.strictObject({
    attempt: z.number().int().positive(),
    maxAttempts: z.number().int().positive(),
    delayMs: z.number().nonnegative(),
    errorMessage: z.string(),
  }),
});

export const RetryFallbackNoticePartSchema = z.strictObject({
  type: z.literal('notice'),
  partId: EntityIdSchema,
  noticeType: z.literal('retry_fallback_applied'),
  level: z.enum(['info', 'warning', 'error']),
  title: z.string().optional(),
  message: z.string().optional(),
  details: z.strictObject({
    from: z.string(),
    to: z.string(),
    role: z.string(),
    reason: z.string().optional(),
  }),
});

export const ServedModelMismatchNoticePartSchema = z.strictObject({
  type: z.literal('notice'),
  partId: EntityIdSchema,
  noticeType: z.literal('served_model_mismatch'),
  level: z.enum(['info', 'warning', 'error']),
  title: z.string().optional(),
  message: z.string().optional(),
  details: z.strictObject({
    requested: z.string(),
    served: z.string(),
    provider: z.string().optional(),
    upstreamProvider: z.string().optional(),
  }),
});

export const CacheInvalidationNoticePartSchema = z.strictObject({
  type: z.literal('notice'),
  partId: EntityIdSchema,
  noticeType: z.literal('cache_invalidation'),
  level: z.enum(['info', 'warning', 'error']),
  title: z.string().optional(),
  message: z.string().optional(),
  details: z.strictObject({
    reprocessedTokens: z.number().int().positive(),
  }),
});
export const CompactionNoticePartSchema = z.strictObject({
  type: z.literal('notice'),
  partId: EntityIdSchema,
  noticeType: z.literal('compaction'),
  level: z.enum(['info', 'warning', 'error']),
  title: z.string().optional(),
  message: z.string().optional(),
  details: z.strictObject({
    method: z.enum(['soft-compacted', 'snap-compacted', 'shaken', 'remote-compacted', 'handed-off', 'compacted']),
    tokensBefore: z.number().int().nonnegative(),
    tokensAfter: z.number().int().nonnegative().optional(),
    summary: z.string().optional(),
    warning: z.string().optional(),
  }),
});

export const NoticePartSchema = z.discriminatedUnion('noticeType', [
  TodoNoticePartSchema,
  TtsrNoticePartSchema,
  AutoRetryNoticePartSchema,
  RetryFallbackNoticePartSchema,
  ServedModelMismatchNoticePartSchema,
  CacheInvalidationNoticePartSchema,
  CompactionNoticePartSchema,
]);
export type NoticePart = z.infer<typeof NoticePartSchema>;
export type CompactionNoticePart = z.infer<typeof CompactionNoticePartSchema>;
export const PartSchema = z.discriminatedUnion('type', [
  TextPartSchema, ReasoningPartSchema, ToolCallPartSchema, ToolResultPartSchema, AttachmentPartSchema, StepSummaryPartSchema, NoticePartSchema,
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
  /** Provider-reported reasoning tokens, when the provider reports them. */
  reasoning: z.number().int().nonnegative().optional(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/**
 * When one assistant step started, delivered its first token, and finished.
 * Times are absolute epochs so a restored step carries the same values the
 * live stream published, and a consumer subtracts rather than sums.
 */
export const StepTimingSchema = z.strictObject({
  startedAt: TimestampSchema,
  firstTokenAt: TimestampSchema.optional(),
  completedAt: TimestampSchema.optional(),
});
export type StepTiming = z.infer<typeof StepTimingSchema>;

export const MessageSchema = z.strictObject({
  messageId: EntityIdSchema, sessionId: EntityIdSchema, turnId: EntityIdSchema,
  role: z.enum(['user', 'assistant', 'system']), createdAt: TimestampSchema, parts: z.array(PartSchema),
  providerId: z.string().min(1).optional(), modelId: z.string().min(1).optional(), usage: TokenUsageSchema.optional(),
  /** Present on assistant steps; a user or notice row carries none. */
  timing: StepTimingSchema.optional(),
});
export type Message = z.infer<typeof MessageSchema>;
