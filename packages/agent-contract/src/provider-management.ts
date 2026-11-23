import { z } from 'zod';
import { CounterSchema, EntityIdSchema } from './primitives.ts';
import { ModelSchema, ProviderConfigurationSchema } from './catalogs.ts';
import {
  OmpProviderApiSchema,
  OmpProviderConfigReadSchema,
  OmpThinkingConfigSchema,
  ProviderHeaderWriteSchema,
  PublicEndpointSchema,
} from './omp-provider-config.ts';
export * from './omp-provider-config.ts';

export const ProviderAccountSchema = z.strictObject({
  credentialRef: EntityIdSchema, method: z.enum(['api-key', 'oauth']), label: z.string().max(128).optional(),
  email: z.string().optional(), accountId: z.string().optional(), active: z.boolean(), disabled: z.boolean(),
});
export const ProviderAccountsSchema = z.strictObject({ revision: CounterSchema, providerId: EntityIdSchema, accounts: z.array(ProviderAccountSchema) });
export type ProviderAccounts = z.infer<typeof ProviderAccountsSchema>;
export const ProviderAccountMutationRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('select'), expectedRevision: CounterSchema, credentialRef: EntityIdSchema }),
  z.strictObject({ action: z.literal('remove'), expectedRevision: CounterSchema, credentialRef: EntityIdSchema }),
  z.strictObject({ action: z.literal('label'), expectedRevision: CounterSchema, credentialRef: EntityIdSchema, label: z.string().trim().max(128) }),
]);
export type ProviderAccountMutationRequest = z.infer<typeof ProviderAccountMutationRequestSchema>;
export const ProviderOAuthMethodsSchema = z.strictObject({
  methods: z.array(z.strictObject({
    methodId: EntityIdSchema, providerId: EntityIdSchema, name: z.string().min(1), storeCredentialsAs: EntityIdSchema,
  }))
});
export type ProviderOAuthMethods = z.infer<typeof ProviderOAuthMethodsSchema>;
const FlowIdentity = { flowId: EntityIdSchema, generation: EntityIdSchema };
export const ProviderOAuthRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('start'), expectedRevision: CounterSchema }),
  z.strictObject({ action: z.literal('status'), ...FlowIdentity }),
  z.strictObject({ action: z.literal('input'), ...FlowIdentity, input: z.string().min(1).max(16384) }),
  z.strictObject({ action: z.literal('cancel'), ...FlowIdentity }),
  z.strictObject({ action: z.literal('commit'), ...FlowIdentity, expectedRevision: CounterSchema }),
]);
export type ProviderOAuthRequest = z.infer<typeof ProviderOAuthRequestSchema>;
export const ProviderOAuthAuthorizationUrlSchema = z.url({ protocol: /^https?$/ }).refine(value => {
  const url = new URL(value); return !url.username && !url.password;
}, 'Authorization URLs cannot contain embedded credentials');
export const ProviderOAuthResultSchema = z.strictObject({
  ...FlowIdentity, providerId: EntityIdSchema, revision: CounterSchema,
  status: z.enum(['pending', 'ready', 'authenticated', 'cancelled', 'failed']),
  authorizationUrl: ProviderOAuthAuthorizationUrlSchema.optional(), instructions: z.string().optional(),
  prompt: z.string().optional(), manualInput: z.boolean(), error: z.enum(['OAUTH_FAILED', 'OAUTH_CANCELLED']).optional(),
  browserCookieNames: z.array(z.string().min(1)).optional(),
});
export type ProviderOAuthResult = z.infer<typeof ProviderOAuthResultSchema>;
// Discovery runs against a custom provider's base URL, which may carry a query
// (`?api-version=`). Embedded credentials stay refused.
export const ProviderModelDiscoveryRequestSchema = z.strictObject({
  providerId: EntityIdSchema.optional(),
  endpoint: PublicEndpointSchema,
  protocol: z.enum(['chat-completions', 'responses', 'messages', 'generate-content']).optional(),
  nativeApi: OmpProviderApiSchema.optional(),
  headers: ProviderHeaderWriteSchema.optional(),
  apiKey: z.string().min(1).optional(),
  credentialRef: EntityIdSchema.optional(),
}).refine(
  request => request.protocol !== undefined || request.nativeApi !== undefined,
  'Discovery request requires protocol or nativeApi',
);
export type ProviderModelDiscoveryRequest = z.infer<typeof ProviderModelDiscoveryRequestSchema>;
/**
 * Capability metadata the bundled OMP catalog publishes for a model id. It is
 * a read-only hint: auto-fill writes it into a custom provider's row only when
 * the user has not set that field, and OMP's bundled catalog stays the
 * authority the runtime executes with.
 */
export const ModelInfoSourceSchema = z.enum(['omp-catalog', 'openrouter']);
export const ModelCatalogInfoSchema = z.strictObject({
  source: ModelInfoSourceSchema,
  input: z.array(z.enum(['text', 'image'])).min(1),
  contextWindow: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
  cost: z.strictObject({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    cacheRead: z.number().nonnegative(),
    cacheWrite: z.number().nonnegative(),
  }),
  reasoning: z.boolean(),
  toolsSupported: z.boolean().optional(),
  thinking: OmpThinkingConfigSchema.optional(),
  imageCountBudget: z.number().int().positive().optional(),
  family: z.string().min(1).optional(),
  status: z.enum(['active', 'alpha', 'beta', 'deprecated']).optional(),
});
export type ModelInfoSource = z.infer<typeof ModelInfoSourceSchema>;
export type ModelCatalogInfo = z.infer<typeof ModelCatalogInfoSchema>;
export const ProviderModelDiscoveryResultSchema = z.strictObject({
  models: z.array(z.strictObject({
    modelId: EntityIdSchema, name: z.string().min(1), contextWindow: z.number().int().positive().optional(), maxOutputTokens: z.number().int().positive().optional(),
    catalog: ModelCatalogInfoSchema.optional(),
  }))
});
export type ProviderModelDiscoveryResult = z.infer<typeof ProviderModelDiscoveryResultSchema>;
// Enrichment is a local catalog read: no endpoint, credentials, or provider entry.
export const ProviderModelEnrichRequestSchema = z.strictObject({
  providerId: EntityIdSchema.optional(),
  models: z.array(z.strictObject({ modelId: EntityIdSchema })).min(1).max(500),
});
export type ProviderModelEnrichRequest = z.infer<typeof ProviderModelEnrichRequestSchema>;
export const ProviderModelEnrichResultSchema = z.strictObject({
  models: z.array(z.strictObject({
    modelId: EntityIdSchema, catalog: ModelCatalogInfoSchema.optional(),
  }))
});
export type ProviderModelEnrichResult = z.infer<typeof ProviderModelEnrichResultSchema>;
import { ImageModelSchema } from './catalogs.ts';
export const ProviderConfigurationReadSchema = z.strictObject({
  revision: CounterSchema,
  configuration: ProviderConfigurationSchema.nullable(),
  headerNames: z.array(z.string()),
  models: z.array(ModelSchema),
  imageModels: z.array(ImageModelSchema).default([]),
  native: OmpProviderConfigReadSchema.optional(),
});
export type ProviderConfigurationRead = z.infer<typeof ProviderConfigurationReadSchema>;
