import { z } from 'zod';
import { CounterSchema, EntityIdSchema } from './primitives.ts';
import { SkillInstallResultSchema } from './catalogs.ts';

const RelativePath = z.string().min(1).max(1024).refine(value => !value.includes('\\') && !value.includes('\0') && value.split('/').every(part => part !== '' && part !== '.' && part !== '..') && !/^[A-Za-z]:/.test(value));
const Scope = z.enum(['workspace', 'agent']);
export const SkillRepositorySourceSchema = z.strictObject({
  id: EntityIdSchema, label: z.string().min(1), source: z.string().min(1), description: z.string().optional(),
  defaultSubpath: RelativePath.optional(), sourceType: z.literal('github').optional(),
  stars: z.number().int().nonnegative().nullable(), repoUpdatedAt: z.string().nullable(),
});
export type SkillRepositorySource = z.infer<typeof SkillRepositorySourceSchema>;
export const SkillRepositoryItemSchema = z.strictObject({
  sourceId: z.string(), repoSource: z.string().min(1), repoSubpath: RelativePath.optional(), gitIdentityId: EntityIdSchema.optional(),
  skillDir: RelativePath, skillName: z.string().min(1), frontmatterName: z.string().optional(), description: z.string().optional(),
  installable: z.boolean(), warnings: z.array(z.string()).optional(),
  installed: z.discriminatedUnion('isInstalled', [
    z.strictObject({ isInstalled: z.literal(false) }),
    z.strictObject({ isInstalled: z.literal(true), scope: Scope, authoredSkillId: RelativePath }),
  ]),
});
export type SkillRepositoryItem = z.infer<typeof SkillRepositoryItemSchema>;
export const SkillRepositoryCatalogSchema = z.strictObject({ workspaceId: EntityIdSchema, sources: z.array(SkillRepositorySourceSchema) });
export type SkillRepositoryCatalog = z.infer<typeof SkillRepositoryCatalogSchema>;
export const SkillRepositorySourceRequestSchema = z.strictObject({ sourceId: EntityIdSchema, refresh: z.boolean().optional() });
export type SkillRepositorySourceRequest = z.infer<typeof SkillRepositorySourceRequestSchema>;
export const SkillRepositoryScanRequestSchema = z.strictObject({ source: z.string().min(1), subpath: RelativePath.optional(), gitIdentityId: EntityIdSchema.optional() });
export type SkillRepositoryScanRequest = z.infer<typeof SkillRepositoryScanRequestSchema>;
export const SkillRepositoryItemsSchema = z.strictObject({ workspaceId: EntityIdSchema, items: z.array(SkillRepositoryItemSchema) });
export type SkillRepositoryItems = z.infer<typeof SkillRepositoryItemsSchema>;
export const SkillRepositoryInstallRequestSchema = z.strictObject({
  sourceId: EntityIdSchema, scope: Scope, expectedSourceRevision: CounterSchema,
  selections: z.array(z.strictObject({ skillDir: RelativePath })).min(1).refine(items => new Set(items.map(item => item.skillDir.split('/').at(-1))).size === items.length, 'Selected skill names are unique'),
  conflictPolicy: z.enum(['prompt', 'skipAll', 'overwriteAll']).optional(),
  conflictDecisions: z.array(z.strictObject({ skillName: z.string().regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/).max(64), decision: z.enum(['skip', 'overwrite']) })).refine(entries => new Set(entries.map(entry => entry.skillName)).size === entries.length, 'Conflict decisions have unique skill names').optional(),
});
export type SkillRepositoryInstallRequest = z.infer<typeof SkillRepositoryInstallRequestSchema>;
export const SkillRepositoryErrorSchema = z.strictObject({
  kind: z.enum(['authRequired', 'invalidSource', 'gitUnavailable', 'networkError', 'conflicts', 'unknown']), message: z.string().min(1),
  conflicts: z.array(z.strictObject({ skillName: z.string().min(1), scope: Scope })).optional(),
});
export type SkillRepositoryError = z.infer<typeof SkillRepositoryErrorSchema>;
export const SkillRepositoryInstallSuccessSchema = z.strictObject({
  ok: z.literal(true), workspaceId: EntityIdSchema,
  installed: z.array(z.strictObject({ skillName: z.string().min(1), scope: Scope })),
  skipped: z.array(z.strictObject({ skillName: z.string().min(1), reason: z.string().min(1) })),
  commit: SkillInstallResultSchema.nullable(),
}).refine(result => (result.installed.length > 0) === (result.commit !== null), 'Installed sources carry a committed revision')
  .refine(result => result.commit === null || (result.installed.every(item => item.scope === result.commit?.scope.kind) && (result.commit.scope.kind !== 'workspace' || result.commit.scope.workspaceId === result.workspaceId)), 'Installation outcomes identify the committed native source');
export const SkillRepositoryInstallResultSchema = z.discriminatedUnion('ok', [
  SkillRepositoryInstallSuccessSchema,
  z.strictObject({ ok: z.literal(false), error: SkillRepositoryErrorSchema }),
]);
export type SkillRepositoryInstallResult = z.infer<typeof SkillRepositoryInstallResultSchema>;
export const SkillRepositoryInstallFailureDetailsSchema = z.strictObject({
  result: SkillInstallResultSchema,
  repository: SkillRepositoryInstallSuccessSchema,
}).refine(details => details.repository.commit !== null && JSON.stringify(details.result) === JSON.stringify(details.repository.commit), 'Failure details identify the same committed source outcome');
export type SkillRepositoryInstallFailureDetails = z.infer<typeof SkillRepositoryInstallFailureDetailsSchema>;
