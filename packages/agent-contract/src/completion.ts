import { z } from 'zod';
import { EntityIdSchema, JsonObjectSchema, JsonValueSchema } from './primitives.ts';
import { ModelSelectionSchema } from './catalogs.ts';

export const CompletionFormatSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text') }),
  z.strictObject({ kind: z.literal('json'), schema: JsonObjectSchema }),
]);
export type CompletionFormat = z.infer<typeof CompletionFormatSchema>;

export const CompletionRequestSchema = z.strictObject({
  completionId: EntityIdSchema,
  workspaceId: EntityIdSchema,
  selection: ModelSelectionSchema,
  prompt: z.string().refine((prompt) => prompt.trim().length > 0, 'A completion prompt contains text'),
  system: z.string().optional(),
  format: CompletionFormatSchema,
  maxOutputTokens: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  overflow: z.enum(['reject', 'truncate']),
  variant: z.string().min(1).nullable(),
  reasoningEffort: z.string().min(1).nullable(),
});
export type CompletionRequest = z.infer<typeof CompletionRequestSchema>;

export const CompletionUsageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
}).refine(
  (usage) => usage.totalTokens === usage.inputTokens + usage.outputTokens,
  'Completion total usage matches its input and output token counts',
);
export type CompletionUsage = z.infer<typeof CompletionUsageSchema>;

export const CompletionOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), text: z.string() }),
  z.strictObject({ kind: z.literal('json'), value: JsonValueSchema }),
]);
export type CompletionOutput = z.infer<typeof CompletionOutputSchema>;

export const CompletionErrorSchema = z.strictObject({
  code: z.enum([
    'MODEL_UNAVAILABLE',
    'PROVIDER_UNAVAILABLE',
    'PROVIDER_FAILURE',
    'CONTEXT_LIMIT',
    'STRUCTURED_OUTPUT_INVALID',
    'UNSUPPORTED_CAPABILITY',
  ]),
  detail: z.string().min(1),
  retryable: z.boolean(),
});
export type CompletionError = z.infer<typeof CompletionErrorSchema>;

const CompletionIdentityFields = {
  completionId: EntityIdSchema,
  selection: ModelSelectionSchema,
};
export const CompletionResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    ...CompletionIdentityFields,
    status: z.literal('completed'),
    output: CompletionOutputSchema,
    finishReason: z.enum(['complete', 'output-limit']),
    usage: CompletionUsageSchema.nullable(),
  }),
  z.strictObject({
    ...CompletionIdentityFields,
    status: z.literal('cancelled'),
    reason: z.enum(['requested', 'timeout']),
  }),
  z.strictObject({
    ...CompletionIdentityFields,
    status: z.literal('failed'),
    error: CompletionErrorSchema,
  }),
]);
export type CompletionResult = z.infer<typeof CompletionResultSchema>;

export const CompletionCancelRequestSchema = z.strictObject({ completionId: EntityIdSchema });
export type CompletionCancelRequest = z.infer<typeof CompletionCancelRequestSchema>;

export const CompletionCancelResultSchema = z.strictObject({
  completionId: EntityIdSchema,
  status: z.literal('cancelled'),
});
export type CompletionCancelResult = z.infer<typeof CompletionCancelResultSchema>;
