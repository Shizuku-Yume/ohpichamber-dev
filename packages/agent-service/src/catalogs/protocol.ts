import { z } from 'zod';
import { AgentCatalogSchema, ModelCatalogSchema, ProviderCatalogSchema, ProviderConfigureRequestSchema, ProviderDeleteRequestSchema, ModelConfigureRequestSchema, ModelDeleteRequestSchema, ProviderCredentialWriteRequestSchema, ProviderCredentialDeleteRequestSchema, ProviderMutationResultSchema, ModelMutationResultSchema, ProviderCredentialMutationResultSchema, SkillExpandRequestSchema, SkillExpandResultSchema, SkillsCatalogStateSchema, SkillsApplyRequestSchema, SkillsWorkerApplyOutcomeSchema, SkillSourceRevisionsSchema, PositiveCounterSchema } from '@openchamber/agent-contract';
export const CatalogOperationSchema = z.discriminatedUnion('type', [
 z.object({type:z.literal('catalog.models.read')}), z.object({type:z.literal('catalog.providers.read')}), z.object({type:z.literal('catalog.agents.read')}),
 z.object({type:z.literal('catalog.provider.configure'),request:ProviderConfigureRequestSchema}), z.object({type:z.literal('catalog.provider.delete'),request:ProviderDeleteRequestSchema}),
 z.object({type:z.literal('catalog.model.configure'),request:ModelConfigureRequestSchema}), z.object({type:z.literal('catalog.model.delete'),request:ModelDeleteRequestSchema}),
 z.object({type:z.literal('catalog.credential.write'),request:ProviderCredentialWriteRequestSchema}), z.object({type:z.literal('catalog.credential.delete'),request:ProviderCredentialDeleteRequestSchema}),
 z.object({type:z.literal('skills.read'),persistedSources:SkillSourceRevisionsSchema}), z.object({type:z.literal('skills.apply'),request:SkillsApplyRequestSchema,sources:SkillSourceRevisionsSchema,catalogRevision:PositiveCounterSchema}), z.object({type:z.literal('skills.expand'),request:SkillExpandRequestSchema}),
]);
export type CatalogOperation = z.infer<typeof CatalogOperationSchema>;
export const CatalogResultSchema = z.discriminatedUnion('type', [
 z.object({type:z.literal('catalog.models'),catalog:ModelCatalogSchema}), z.object({type:z.literal('catalog.providers'),catalog:ProviderCatalogSchema}), z.object({type:z.literal('catalog.agents'),catalog:AgentCatalogSchema}),
 z.object({type:z.literal('catalog.provider.mutated'),result:ProviderMutationResultSchema}), z.object({type:z.literal('catalog.model.mutated'),result:ModelMutationResultSchema}), z.object({type:z.literal('catalog.credential.mutated'),result:ProviderCredentialMutationResultSchema}),
 z.object({type:z.literal('skills.catalog'),catalog:SkillsCatalogStateSchema}), z.object({type:z.literal('skills.applied'),result:SkillsWorkerApplyOutcomeSchema}), z.object({type:z.literal('skills.expanded'),result:SkillExpandResultSchema}),
]);
export type CatalogResult = z.infer<typeof CatalogResultSchema>;
