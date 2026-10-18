import { z } from 'zod';
import { WebSearchConfigStateSchema, WebSearchUpdateRequestSchema, WebSearchCredentialWriteRequestSchema, WebSearchCredentialDeleteRequestSchema, WebSearchMutationResultSchema } from '@openchamber/agent-contract';

export const WebSearchOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('read') }),
  z.strictObject({ type: z.literal('update'), request: WebSearchUpdateRequestSchema }),
  z.strictObject({ type: z.literal('credential.write'), request: WebSearchCredentialWriteRequestSchema }),
  z.strictObject({ type: z.literal('credential.delete'), request: WebSearchCredentialDeleteRequestSchema }),
  z.strictObject({ type: z.literal('apply') }),
]);
export type WebSearchOperation = z.infer<typeof WebSearchOperationSchema>;
export const WebSearchResultSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('state'), state: WebSearchConfigStateSchema }),
  z.strictObject({ type: z.literal('mutated'), result: WebSearchMutationResultSchema }),
  z.strictObject({ type: z.literal('applied') }),
]);
export type WebSearchResult = z.infer<typeof WebSearchResultSchema>;
