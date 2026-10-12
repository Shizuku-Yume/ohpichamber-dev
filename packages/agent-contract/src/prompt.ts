import { z } from 'zod';
import { EntityIdSchema, JsonObjectSchema, TimestampSchema } from './primitives.ts';

export const CapturedSendOptionsSchema = z.strictObject({
  providerId: EntityIdSchema.nullable(),
  modelId: EntityIdSchema.nullable(),
  agentId: EntityIdSchema.nullable(),
  variant: EntityIdSchema.nullable(),
  reasoningEffort: EntityIdSchema.nullable(),
});
export type CapturedSendOptions = z.infer<typeof CapturedSendOptionsSchema>;

export const PromptAttachmentSchema = z.strictObject({
  attachmentId: EntityIdSchema,
  name: z.string(),
  mediaType: z.string().min(1),
  size: z.number().int().nonnegative(),
  uri: z.string(),
}).refine((attachment) => attachment.uri === `attachment://${attachment.attachmentId}`, {
  message: 'Attachment URI must identify its Host upload', path: ['uri'],
});
export type PromptAttachment = z.infer<typeof PromptAttachmentSchema>;

export const PromptContextSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('context'), text: z.string(), metadata: JsonObjectSchema,
    instructions: z.string().optional(), deliveryReceiptId: EntityIdSchema.optional(),
  }),
  z.strictObject({ kind: z.literal('instruction'), text: z.string() }),
  z.strictObject({ kind: z.literal('synthetic'), text: z.string() }),
]);
export type PromptContext = z.infer<typeof PromptContextSchema>;
export const PromptInputSchema = z.strictObject({
  text: z.string(), attachments: z.array(PromptAttachmentSchema), context: z.array(PromptContextSchema),
  agentMention: z.strictObject({ agentId: EntityIdSchema }).optional(),
});
export type PromptInput = z.infer<typeof PromptInputSchema>;
export const PromptRequestSchema = z.strictObject({ input: PromptInputSchema, options: CapturedSendOptionsSchema });
export type PromptRequest = z.infer<typeof PromptRequestSchema>;
export const AttachmentSchema = PromptAttachmentSchema.safeExtend({ createdAt: TimestampSchema });
export type Attachment = z.infer<typeof AttachmentSchema>;
