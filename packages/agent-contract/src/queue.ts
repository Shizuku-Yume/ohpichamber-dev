import { z } from 'zod';
import { CounterSchema, EntityIdSchema, TimestampSchema } from './primitives.ts';
import {
  CapturedSendOptionsSchema,
  PromptAttachmentSchema,
  PromptContextSchema,
  PromptRequestSchema,
} from './prompt.ts';

const ContextPreviewSchema = z.string().refine(
  (preview) => preview.length <= 100
    || (preview.length <= 103 && preview.endsWith('...'))
    || (preview.length <= 101 && preview.endsWith('…')),
  'Context preview contains at most 100 characters plus an ellipsis',
);
const ContextDescriptorSchema = z.strictObject({
  index: z.number().int().nonnegative(),
  kind: z.enum(['context', 'instruction', 'synthetic']),
  hasInstructions: z.boolean(),
  deliveryReceiptId: EntityIdSchema.optional(),
}).refine(
  (context) => context.kind === 'context' || (!context.hasInstructions && context.deliveryReceiptId === undefined),
  'Only captured context entries carry instructions or a delivery receipt',
);

const QueueItemContentFields = {
  queueItemId: EntityIdSchema,
  content: z.string(),
  text: z.string(),
  attachments: z.array(PromptAttachmentSchema),
  context: z.array(ContextDescriptorSchema).refine(
    (context) => context.every((entry, index) => entry.index === index),
    'Context descriptors retain their captured delivery order',
  ),
  contextPreview: ContextPreviewSchema.optional(),
  agentMention: z.strictObject({ agentId: EntityIdSchema }).optional(),
  options: CapturedSendOptionsSchema,
  createdAt: TimestampSchema,
  originalAvailable: z.boolean(),
};

export const QueueItemContentSchema = z.strictObject(QueueItemContentFields);
export type QueueItemContent = z.infer<typeof QueueItemContentSchema>;

export const QueueItemSchema = z.discriminatedUnion('status', [
  z.strictObject({ ...QueueItemContentFields, status: z.literal('queued') }),
  z.strictObject({
    ...QueueItemContentFields,
    status: z.literal('leased'),
    lease: z.strictObject({ leaseId: EntityIdSchema, expiresAt: TimestampSchema }),
  }).refine((item) => item.lease.expiresAt > item.createdAt, 'Lease expiry follows queue admission'),
]);
export type QueueItem = z.infer<typeof QueueItemSchema>;

export const QueueStateSchema = z.strictObject({
  sessionId: EntityIdSchema,
  revision: CounterSchema,
  items: z.array(QueueItemSchema).refine(
    (items) => new Set(items.map((item) => item.queueItemId)).size === items.length,
    'Each queue item appears once in the authoritative delivery order',
  ),
});
export type QueueState = z.infer<typeof QueueStateSchema>;

export const QueueDraftAttachmentSchema = z.strictObject({
  attachmentId: EntityIdSchema,
  name: z.string().min(1),
  mediaType: z.string().min(1),
  size: z.number().int().nonnegative(),
  uri: z.string(),
  agentPath: z.string().optional(),
  original: z.strictObject({
    mimeType: z.string().min(1),
    dataUrl: z.string().min(1),
    saveOnSend: z.boolean().optional(),
  }).optional(),
});
export type QueueDraftAttachment = z.infer<typeof QueueDraftAttachmentSchema>;

export const QueueOriginalDraftSchema = z.strictObject({
  content: z.string(),
  text: z.string(),
  attachments: z.array(QueueDraftAttachmentSchema),
  context: z.array(PromptContextSchema),
  agentMention: z.strictObject({ agentId: EntityIdSchema }).optional(),
  options: CapturedSendOptionsSchema,
  goal: z.strictObject({
    objective: z.string().optional(),
    tokenBudget: z.number().nullable(),
  }).optional(),
  contextPreview: ContextPreviewSchema.optional(),
});
export type QueueOriginalDraft = z.infer<typeof QueueOriginalDraftSchema>;

export const QueueAppendRequestSchema = z.strictObject({
  expectedRevision: CounterSchema,
  content: z.string(),
  contextPreview: ContextPreviewSchema.optional(),
  request: PromptRequestSchema,
  draft: QueueOriginalDraftSchema.optional(),
});
export type QueueAppendRequest = z.infer<typeof QueueAppendRequestSchema>;

export const QueueTakeRequestSchema = z.strictObject({
  expectedRevision: CounterSchema,
  queueItemId: EntityIdSchema,
});
export type QueueTakeRequest = z.infer<typeof QueueTakeRequestSchema>;

export const QueueTakeResultSchema = z.strictObject({
  queue: QueueStateSchema,
  draft: QueueOriginalDraftSchema.nullable(),
  text: z.string(),
  content: z.string(),
  createdAt: TimestampSchema,
});
export type QueueTakeResult = z.infer<typeof QueueTakeResultSchema>;

export const QueueReorderRequestSchema = z.strictObject({
  expectedRevision: CounterSchema,
  queueItemIds: z.array(EntityIdSchema).refine(
    (ids) => new Set(ids).size === ids.length,
    'Reorder contains each current item ID exactly once',
  ),
});
export type QueueReorderRequest = z.infer<typeof QueueReorderRequestSchema>;

export const QueueDeleteRequestSchema = z.strictObject({
  expectedRevision: CounterSchema,
  queueItemId: EntityIdSchema,
});
export type QueueDeleteRequest = z.infer<typeof QueueDeleteRequestSchema>;
