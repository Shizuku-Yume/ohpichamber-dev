import { z } from 'zod';
import {
  AgentCatalogSchema, AgentCreateRequestSchema, AgentUpdateRequestSchema, AgentDeleteRequestSchema,
  AgentMutationResultSchema, PositiveCounterSchema, ModelCatalogSchema, ModelConfigureRequestSchema,
  ModelDeleteRequestSchema, ModelMutationResultSchema, ProviderCatalogSchema,
  ProviderConfigureRequestSchema, ProviderDeleteRequestSchema, ProviderMutationResultSchema,
  ProviderCredentialWriteRequestSchema, ProviderCredentialDeleteRequestSchema,
  ProviderCredentialMutationResultSchema, SkillExpandRequestSchema, SkillExpandResultSchema,
  SkillsCatalogStateSchema, SkillsApplyRequestSchema, SkillsWorkerApplyOutcomeSchema,
  SkillSourceRevisionsSchema,
} from '@openchamber/agent-contract';
import { PrivateCredentialResolveRequestSchema, PrivateCredentialResolveResultSchema,
  PrivateCredentialHandoffRequestSchema, PrivateCredentialHandoffResultSchema } from './private-credentials.ts';
export * from './private-credentials.ts';

// Private worker envelopes carry canonical requests and owner-captured revisions.
// The service owns authorization, CAS, serialization and cross-worker fan-out.
export const CatalogOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('catalog.models.read') }),
  z.strictObject({ type: z.literal('catalog.providers.read') }),
  z.strictObject({ type: z.literal('catalog.agents.read') }),
  z.strictObject({ type: z.literal('catalog.provider.configure'), request: ProviderConfigureRequestSchema }),
  z.strictObject({ type: z.literal('catalog.provider.delete'), request: ProviderDeleteRequestSchema }),
  z.strictObject({ type: z.literal('catalog.model.configure'), request: ModelConfigureRequestSchema }),
  z.strictObject({ type: z.literal('catalog.model.delete'), request: ModelDeleteRequestSchema }),
  z.strictObject({ type: z.literal('catalog.credential.resolve'), request: PrivateCredentialResolveRequestSchema }),
  z.strictObject({ type: z.literal('catalog.credential.write'), request: ProviderCredentialWriteRequestSchema }),
  z.strictObject({ type: z.literal('catalog.credential.handoff'), request: PrivateCredentialHandoffRequestSchema }),
  z.strictObject({ type: z.literal('catalog.credential.delete'), request: ProviderCredentialDeleteRequestSchema }),
  z.strictObject({ type: z.literal('catalog.agent.create'), request: AgentCreateRequestSchema }),
  z.strictObject({ type: z.literal('catalog.agent.update'), request: AgentUpdateRequestSchema }),
  z.strictObject({ type: z.literal('catalog.agent.delete'), request: AgentDeleteRequestSchema }),
  z.strictObject({ type: z.literal('skills.read'), persistedSources: SkillSourceRevisionsSchema }),
  z.strictObject({
    type: z.literal('skills.apply'), request: SkillsApplyRequestSchema,
    sources: SkillSourceRevisionsSchema, catalogRevision: PositiveCounterSchema,
  }).refine(operation => operation.sources[operation.request.scope] === operation.request.sourceRevision,
    'Skill apply captures the requested source revision'),
  z.strictObject({ type: z.literal('skills.expand'), request: SkillExpandRequestSchema }),
]);
export type CatalogOperation = z.infer<typeof CatalogOperationSchema>;

export const CatalogResultSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('catalog.models'), catalog: ModelCatalogSchema }),
  z.strictObject({ type: z.literal('catalog.providers'), catalog: ProviderCatalogSchema }),
  z.strictObject({ type: z.literal('catalog.agents'), catalog: AgentCatalogSchema }),
  z.strictObject({ type: z.literal('catalog.provider.mutated'), result: ProviderMutationResultSchema }),
  z.strictObject({ type: z.literal('catalog.model.mutated'), result: ModelMutationResultSchema }),
  z.strictObject({ type: z.literal('catalog.credential.mutated'), result: ProviderCredentialMutationResultSchema }),
  z.strictObject({ type: z.literal('catalog.credential.resolved'), result: PrivateCredentialResolveResultSchema }),
  z.strictObject({ type: z.literal('catalog.credential.handed-off'), result: PrivateCredentialHandoffResultSchema }),
  z.strictObject({ type: z.literal('catalog.agent.mutated'), result: AgentMutationResultSchema }),
  z.strictObject({ type: z.literal('skills.applied'), result: SkillsWorkerApplyOutcomeSchema }),
  z.strictObject({ type: z.literal('skills.expanded'), result: SkillExpandResultSchema }),
]);
export type CatalogResult = z.infer<typeof CatalogResultSchema>;
