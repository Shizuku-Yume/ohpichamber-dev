import { z } from 'zod';
import {
  CompletionCancelRequestSchema,
  CompletionCancelResultSchema,
  CompletionRequestSchema,
  CompletionResultSchema as CompletionWireResultSchema,
} from '@openchamber/agent-contract';

export const CompletionOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('completion.start'), request: CompletionRequestSchema }),
  z.strictObject({ type: z.literal('completion.cancel'), request: CompletionCancelRequestSchema }),
]);
export type CompletionOperation = z.infer<typeof CompletionOperationSchema>;

export const CompletionResultSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('completion.result'), result: CompletionWireResultSchema }),
  z.strictObject({ type: z.literal('completion.cancelled'), result: CompletionCancelResultSchema }),
]);
export type CompletionResult = z.infer<typeof CompletionResultSchema>;
