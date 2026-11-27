import { z } from 'zod';
import { CounterSchema, EntityIdSchema } from '@openchamber/agent-contract';

const PrivateCredentialPurposeSchema = z.enum(['quota', 'tts', 'routing']);
export const PrivateCredentialResolveRequestSchema = z.strictObject({
  workspaceId: EntityIdSchema, agentDirectoryId: EntityIdSchema,
  providerId: EntityIdSchema, credentialRef: EntityIdSchema,
  purpose: PrivateCredentialPurposeSchema,
});
// These are the installed SDK's stored credential fields, not a legacy auth projection.
const PrivateCredentialSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('api_key'), key: z.string().min(1) }),
  z.strictObject({
    type: z.literal('oauth'), access: z.string().min(1), refresh: z.string().min(1), expires: z.number().finite(),
    enterpriseUrl: z.string().optional(), projectId: z.string().optional(), email: z.string().optional(),
    accountId: z.string().optional(), apiEndpoint: z.string().optional(), orgId: z.string().optional(),
    orgName: z.string().optional(), region: z.string().optional(), inferenceRegion: z.enum(['global', 'eu', 'us']).optional(),
    activeOrganizationId: z.string().optional(), authorizedAt: z.number().optional(),
  }),
]);
export const PrivateCredentialResolveResultSchema = PrivateCredentialResolveRequestSchema.extend({ credential: PrivateCredentialSchema });
export type PrivateCredentialResolveRequest = z.infer<typeof PrivateCredentialResolveRequestSchema>;
export type PrivateCredentialResolveResult = z.infer<typeof PrivateCredentialResolveResultSchema>;

const ProviderIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const DescriptorSchema = z.strictObject({
  providerId: ProviderIdSchema, source: z.enum(['stored-credential', 'managed-environment', 'external-environment']),
  credentialType: z.enum(['key', 'oauth']),
});
const SelectedCredentialSelectionSchema = z.union([
  DescriptorSchema,
  z.strictObject({
    providerId: ProviderIdSchema, source: z.literal('selected-file'), credentialType: z.literal('key'),
    file: z.strictObject({ format: z.literal('opencode-auth-entry'), content: z.string().min(1).max(16_384) }),
  }),
]);
export const SelectedCredentialHandoffRequestSchema = z.strictObject({
  intent: z.literal('credential-handoff'), consent: z.literal(true), workspaceId: EntityIdSchema,
  selections: z.array(SelectedCredentialSelectionSchema).min(1).max(16),
}).refine(request => new Set(request.selections.map(selection => selection.providerId)).size === request.selections.length,
  'Each selected provider occurs once');
const SelectedCredentialHandoffOutcomeSchema = z.strictObject({
  providerId: ProviderIdSchema,
  source: z.enum(['stored-credential', 'managed-environment', 'external-environment', 'selected-file']),
  credentialType: z.enum(['key', 'oauth']),
  status: z.enum(['imported', 'unsupported', 're-auth-required', 'unavailable']),
  code: z.string().min(1), credentialRef: EntityIdSchema.optional(),
}).refine(outcome => (outcome.status === 'imported') === (outcome.credentialRef !== undefined), 'Only a verified import has a credential reference');
export const SelectedCredentialHandoffResultSchema = z.strictObject({
  workspaceId: EntityIdSchema, results: z.array(SelectedCredentialHandoffOutcomeSchema).min(1).max(16),
});
export const PrivateCredentialHandoffRequestSchema = z.strictObject({
  workspaceId: EntityIdSchema, agentDirectoryId: EntityIdSchema, expectedRevision: CounterSchema,
  selection: SelectedCredentialSelectionSchema,
});
export type PrivateCredentialHandoffRequest = z.infer<typeof PrivateCredentialHandoffRequestSchema>;
export type SelectedCredentialHandoffOutcome = z.infer<typeof SelectedCredentialHandoffOutcomeSchema>;
export const PrivateCredentialHandoffResultSchema = z.strictObject({
  workspaceId: EntityIdSchema, agentDirectoryId: EntityIdSchema, revision: CounterSchema,
  outcome: SelectedCredentialHandoffOutcomeSchema,
});
export type PrivateCredentialHandoffResult = z.infer<typeof PrivateCredentialHandoffResultSchema>;
