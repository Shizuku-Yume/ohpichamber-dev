import { z } from 'zod';
import { EntityIdSchema, TimestampSchema } from './primitives.ts';
import { ProblemCodeSchema } from './errors.ts';

export const PromptReceiptOperationSchema = z.enum(['send', 'steer', 'followUp']);
export type PromptReceiptOperation = z.infer<typeof PromptReceiptOperationSchema>;

export const AcceptedPromptReceiptSchema = z.strictObject({
  outcome: z.literal('accepted'),
  correlationId: EntityIdSchema,
  sessionId: EntityIdSchema,
  operation: PromptReceiptOperationSchema,
  runId: EntityIdSchema,
  userMessageId: EntityIdSchema.optional(),
  acceptedAt: TimestampSchema,
  expiresAt: TimestampSchema,
}).refine(
  (receipt) => receipt.expiresAt > receipt.acceptedAt,
  { message: 'Receipt expiry follows the acceptance decision' },
);
export type AcceptedPromptReceipt = z.infer<typeof AcceptedPromptReceiptSchema>;

export const RejectedPromptReceiptSchema = z.strictObject({
  outcome: z.literal('rejected'),
  correlationId: EntityIdSchema,
  sessionId: EntityIdSchema,
  operation: PromptReceiptOperationSchema,
  code: ProblemCodeSchema,
  detail: z.string().min(1),
  rejectedAt: TimestampSchema,
  expiresAt: TimestampSchema,
}).refine(
  (receipt) => receipt.expiresAt > receipt.rejectedAt,
  { message: 'Receipt expiry follows the rejection decision' },
);
export type RejectedPromptReceipt = z.infer<typeof RejectedPromptReceiptSchema>;

export const PromptReceiptSchema = z.discriminatedUnion('outcome', [
  AcceptedPromptReceiptSchema,
  RejectedPromptReceiptSchema,
]);
export type PromptReceipt = z.infer<typeof PromptReceiptSchema>;

export const PromptReceiptResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('accepted'), receipt: AcceptedPromptReceiptSchema }),
  z.strictObject({ status: z.literal('rejected'), receipt: RejectedPromptReceiptSchema }),
  z.strictObject({ status: z.literal('unknown'), correlationId: EntityIdSchema, sessionId: EntityIdSchema }),
]);
export type PromptReceiptResult = z.infer<typeof PromptReceiptResultSchema>;
