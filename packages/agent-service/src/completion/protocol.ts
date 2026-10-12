import { z } from 'zod';
import {
  CompletionCancelRequestSchema,
  CompletionCancelResultSchema,
  CompletionRequestSchema,
  CompletionResultSchema as CompletionWireResultSchema,
} from '@openchamber/agent-contract';

export const CompletionOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('complete'), request: CompletionRequestSchema }),
  z.strictObject({ type: z.literal('cancel'), request: CompletionCancelRequestSchema }),
]);
export type CompletionOperation = z.infer<typeof CompletionOperationSchema>;

export const CompletionResultSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('complete'), result: CompletionWireResultSchema }),
  z.strictObject({ type: z.literal('cancel'), result: CompletionCancelResultSchema }),
]);
export type CompletionResult = z.infer<typeof CompletionResultSchema>;
