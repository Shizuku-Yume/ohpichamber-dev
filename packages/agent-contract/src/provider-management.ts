import { z } from 'zod';
import { CounterSchema, EntityIdSchema } from './primitives.ts';
import { ModelSchema, ProviderConfigurationSchema } from './catalogs.ts';

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
export const ProviderOAuthMethodsSchema = z.strictObject({ methods: z.array(z.strictObject({
  methodId: EntityIdSchema, providerId: EntityIdSchema, name: z.string().min(1), storeCredentialsAs: EntityIdSchema,
})) });
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
const EndpointSchema = z.url({ protocol: /^https?$/ }).refine(value => {
  const url = new URL(value); return !url.username && !url.password && !url.search && !url.hash;
});
export const ProviderHeaderWriteSchema = z.record(z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/), z.string().refine(value => !/[\r\n]/.test(value)));
export const ProviderModelDiscoveryRequestSchema = z.strictObject({
  providerId: EntityIdSchema.optional(), endpoint: EndpointSchema,
  protocol: z.enum(['chat-completions', 'responses', 'messages', 'generate-content']),
  headers: ProviderHeaderWriteSchema.optional(), apiKey: z.string().min(1).optional(), credentialRef: EntityIdSchema.optional(),
});
export type ProviderModelDiscoveryRequest = z.infer<typeof ProviderModelDiscoveryRequestSchema>;
export const ProviderModelDiscoveryResultSchema = z.strictObject({ models: z.array(z.strictObject({
  modelId: EntityIdSchema, name: z.string().min(1), contextWindow: z.number().int().positive().optional(), maxOutputTokens: z.number().int().positive().optional(),
})) });
export type ProviderModelDiscoveryResult = z.infer<typeof ProviderModelDiscoveryResultSchema>;
export const ProviderConfigurationReadSchema = z.strictObject({ revision: CounterSchema, configuration: ProviderConfigurationSchema, headerNames: z.array(z.string()), models: z.array(ModelSchema) });
export type ProviderConfigurationRead = z.infer<typeof ProviderConfigurationReadSchema>;
