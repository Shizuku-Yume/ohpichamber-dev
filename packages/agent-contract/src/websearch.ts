import { z } from 'zod';
import { CounterSchema, EntityIdSchema } from './primitives.ts';

const ProviderIdsSchema = z.array(z.string().min(1)).refine(
  (ids) => new Set(ids).size === ids.length,
  'Search fallback identities must be unique',
);
const ProviderEndpointSchema = z.string().url().refine((value) => {
  const endpoint = new URL(value);
  return (endpoint.protocol === 'http:' || endpoint.protocol === 'https:') && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash;
}, 'Search endpoints must use HTTP(S) without embedded credentials, query, or fragment');

export const WebSearchProviderOptionsSchema = z.strictObject({
  exa: z.strictObject({ enabled: z.boolean().nullable().optional() }).optional(),
  searxng: z.strictObject({ language: z.string().nullable().optional(), safesearch: z.union([z.literal(0), z.literal(1), z.literal(2)]).nullable().optional() }).optional(),
});
export type WebSearchProviderOptions = z.infer<typeof WebSearchProviderOptionsSchema>;
export const WebSearchProviderEntrySchema = z.strictObject({
  providerId: z.string().min(1), name: z.string().min(1), configured: z.boolean(), requiresCredential: z.boolean(),
  isSelfHosted: z.boolean(), credentialWritable: z.boolean(), credentialConfigured: z.boolean(),
  endpoint: ProviderEndpointSchema.optional(), searchDelayMs: z.number().finite().nonnegative().optional(),
  categories: z.string().optional(), engines: z.string().optional(), options: WebSearchProviderOptionsSchema.optional(),
}).superRefine((provider, context) => {
  if (!provider.options) return;
  if ((provider.providerId === 'web/exa' && provider.options.searxng !== undefined)
    || (provider.providerId === 'web/searxng' && provider.options.exa !== undefined)
    || (!['web/exa', 'web/searxng'].includes(provider.providerId) && Object.keys(provider.options).length > 0)) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Provider options must match a supported native search provider' });
  }
});
export type WebSearchProviderEntry = z.infer<typeof WebSearchProviderEntrySchema>;
export const WebSearchConfigStateSchema = z.strictObject({
  workspaceId: EntityIdSchema, revision: CounterSchema, enabled: z.boolean(),
  selectedProviderId: z.string().min(1).nullable(), fallbackProviderIds: ProviderIdsSchema,
  timeoutSeconds: z.number().finite().positive().max(300),
  providers: z.array(WebSearchProviderEntrySchema).refine((providers) => new Set(providers.map((provider) => provider.providerId)).size === providers.length, 'Search provider identities must be unique'),
});
export type WebSearchConfigState = z.infer<typeof WebSearchConfigStateSchema>;
export const WebSearchUpdateRequestSchema = z.strictObject({
  expectedRevision: CounterSchema, enabled: z.boolean().optional(), selectedProviderId: z.string().min(1).nullable().optional(),
  fallbackProviderIds: ProviderIdsSchema.nullable().optional(), timeoutSeconds: z.number().finite().positive().max(300).optional(),
  providerEndpoint: ProviderEndpointSchema.nullable().optional(), providerSearchDelayMs: z.number().finite().nonnegative().nullable().optional(),
  providerCategories: z.string().nullable().optional(), providerEngines: z.string().nullable().optional(), providerOptions: WebSearchProviderOptionsSchema.optional(),
}).superRefine((request, context) => {
  if (request.selectedProviderId && request.fallbackProviderIds?.includes(request.selectedProviderId)) context.addIssue({ code: 'custom', path: ['fallbackProviderIds'], message: 'The primary search provider cannot also be a fallback' });
});
export type WebSearchUpdateRequest = z.infer<typeof WebSearchUpdateRequestSchema>;
export const WebSearchCredentialWriteRequestSchema = z.strictObject({ expectedRevision: CounterSchema, providerId: z.string().min(1), apiKey: z.string().min(1).max(65_536) });
export type WebSearchCredentialWriteRequest = z.infer<typeof WebSearchCredentialWriteRequestSchema>;
export const WebSearchCredentialDeleteRequestSchema = z.strictObject({ expectedRevision: CounterSchema, providerId: z.string().min(1) });
export type WebSearchCredentialDeleteRequest = z.infer<typeof WebSearchCredentialDeleteRequestSchema>;
export const WebSearchWorkerApplyOutcomeSchema = z.strictObject({ sessionId: EntityIdSchema, workerGeneration: EntityIdSchema, status: z.enum(['applied', 'failed']), code: z.string().min(1).nullable() }).superRefine((worker, context) => {
  if ((worker.status === 'applied') !== (worker.code === null)) context.addIssue({ code: 'custom', path: ['code'], message: 'Only failed workers carry an error code' });
});
export type WebSearchWorkerApplyOutcome = z.infer<typeof WebSearchWorkerApplyOutcomeSchema>;
export const WebSearchMutationResultSchema = z.strictObject({ state: WebSearchConfigStateSchema, status: z.enum(['applied', 'partial', 'failed']), persistence: z.enum(['persisted', 'failed']), workers: z.array(WebSearchWorkerApplyOutcomeSchema) }).superRefine((result, context) => {
  const failed = result.workers.some((worker) => worker.status === 'failed');
  const expected = result.persistence === 'failed' ? 'failed' : failed ? 'partial' : 'applied';
  if (result.status !== expected) context.addIssue({ code: 'custom', path: ['status'], message: 'Search mutation status must reflect persistence and worker failures' });
  if (new Set(result.workers.map((worker) => worker.sessionId)).size !== result.workers.length) context.addIssue({ code: 'custom', path: ['workers'], message: 'Search worker outcomes must have unique session identities' });
});
export type WebSearchMutationResult = z.infer<typeof WebSearchMutationResultSchema>;
