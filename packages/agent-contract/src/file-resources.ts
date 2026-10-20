import { z } from 'zod';
import { CounterSchema, EntityIdSchema } from './primitives.ts';
import { ModelSelectionSchema, SkillSourceRevisionsSchema } from './catalogs.ts';

export const FileResourceScopeSchema = z.enum(['workspace', 'agent']);
export type FileResourceScope = z.infer<typeof FileResourceScopeSchema>;
export const FileResourcePathSchema = z.string().min(1).refine(value => !value.startsWith('/') && !value.includes('\\') && !value.includes(':') && !/[\x00-\x1f\x7f]/.test(value) && value.split('/').every(part => part !== '' && part !== '.' && part !== '..'), 'A resource path stays inside its native root');
export const FileResourceNameSchema = FileResourcePathSchema.refine(value => /^[\p{L}\p{N}_./-]+$/u.test(value) && !value.endsWith('.md') && value.split('/').every(part => !part.startsWith('.')), 'A resource name is a relative slash name without a Markdown extension');
const bindings = { modelSelection: ModelSelectionSchema.optional(), agentId: EntityIdSchema.optional() };
const authored = { name: FileResourceNameSchema, description: z.string().optional(), content: z.string(), scope: FileResourceScopeSchema, group: z.string().optional(), ...bindings };
const entry = { name: z.string().min(1), description: z.string(), content: z.string(), scope: z.enum(['workspace', 'agent', 'inherited']), source: z.string(), editable: z.boolean(), group: z.string().optional(), ...bindings };
export const CommandEntrySchema = z.strictObject({ commandId: EntityIdSchema, ...entry, argumentHint: z.string().optional() });
export type CommandEntry = z.infer<typeof CommandEntrySchema>;
export const PromptTemplateEntrySchema = z.strictObject({ templateId: EntityIdSchema, ...entry });
export type PromptTemplateEntry = z.infer<typeof PromptTemplateEntrySchema>;
export const CommandCatalogStateSchema = z.strictObject({ workspaceId: EntityIdSchema, revision: CounterSchema, commands: z.array(CommandEntrySchema).refine(items => new Set(items.map(item => item.commandId)).size === items.length) });
export type CommandCatalogState = z.infer<typeof CommandCatalogStateSchema>;
export const PromptTemplateCatalogStateSchema = z.strictObject({ workspaceId: EntityIdSchema, revision: CounterSchema, templates: z.array(PromptTemplateEntrySchema).refine(items => new Set(items.map(item => item.templateId)).size === items.length) });
export type PromptTemplateCatalogState = z.infer<typeof PromptTemplateCatalogStateSchema>;
export const CommandCreateRequestSchema = z.strictObject({ expectedRevision: CounterSchema, ...authored, argumentHint: z.string().optional() });
export type CommandCreateRequest = z.infer<typeof CommandCreateRequestSchema>;
export const CommandUpdateRequestSchema = CommandCreateRequestSchema.extend({ commandId: EntityIdSchema });
export type CommandUpdateRequest = z.infer<typeof CommandUpdateRequestSchema>;
export const CommandDeleteRequestSchema = z.strictObject({ expectedRevision: CounterSchema, commandId: EntityIdSchema });
export type CommandDeleteRequest = z.infer<typeof CommandDeleteRequestSchema>;
export const PromptTemplateCreateRequestSchema = z.strictObject({ expectedRevision: CounterSchema, ...authored });
export type PromptTemplateCreateRequest = z.infer<typeof PromptTemplateCreateRequestSchema>;
export const PromptTemplateUpdateRequestSchema = PromptTemplateCreateRequestSchema.extend({ templateId: EntityIdSchema });
export type PromptTemplateUpdateRequest = z.infer<typeof PromptTemplateUpdateRequestSchema>;
export const PromptTemplateDeleteRequestSchema = z.strictObject({ expectedRevision: CounterSchema, templateId: EntityIdSchema });
export type PromptTemplateDeleteRequest = z.infer<typeof PromptTemplateDeleteRequestSchema>;
export const CommandExpandRequestSchema = z.strictObject({ commandId: EntityIdSchema, arguments: z.string() });
export type CommandExpandRequest = z.infer<typeof CommandExpandRequestSchema>;
export const PromptTemplateExpandRequestSchema = z.strictObject({ templateId: EntityIdSchema, arguments: z.string() });
export type PromptTemplateExpandRequest = z.infer<typeof PromptTemplateExpandRequestSchema>;
export const FileResourceExpandTextRequestSchema = z.strictObject({ text: z.string() });
export type FileResourceExpandTextRequest = z.infer<typeof FileResourceExpandTextRequestSchema>;
export const FileResourceExpandResultSchema = z.strictObject({ content: z.string(), ...bindings });
export type FileResourceExpandResult = z.infer<typeof FileResourceExpandResultSchema>;
export const FileResourcePromptInputResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('command'), content: z.string(), ...bindings }),
  z.strictObject({ kind: z.literal('template'), content: z.string(), ...bindings }),
  z.strictObject({ kind: z.literal('text'), content: z.string() }),
]);
export type FileResourcePromptInputResult = z.infer<typeof FileResourcePromptInputResultSchema>;

export const SkillFileEntrySchema = z.strictObject({ filePath: FileResourcePathSchema, content: z.string() });
export type SkillFileEntry = z.infer<typeof SkillFileEntrySchema>;
export const SkillFileCatalogStateSchema = z.strictObject({ workspaceId: EntityIdSchema, sources: SkillSourceRevisionsSchema, skills: z.array(z.strictObject({ skillId: FileResourcePathSchema, name: z.string().min(1), scope: FileResourceScopeSchema, files: z.array(FileResourcePathSchema) })) });
export type SkillFileCatalogState = z.infer<typeof SkillFileCatalogStateSchema>;
export const SkillFilesStateSchema = z.strictObject({ workspaceId: EntityIdSchema, skillId: FileResourcePathSchema, scope: FileResourceScopeSchema, sourceRevision: CounterSchema, files: z.array(SkillFileEntrySchema) });
export type SkillFilesState = z.infer<typeof SkillFilesStateSchema>;
export const SkillFileReadSchema = z.strictObject({ workspaceId: EntityIdSchema, skillId: FileResourcePathSchema, scope: FileResourceScopeSchema, sourceRevision: CounterSchema, ...SkillFileEntrySchema.shape });
export type SkillFileRead = z.infer<typeof SkillFileReadSchema>;
export const SkillFileWriteRequestSchema = z.strictObject({ expectedSourceRevision: CounterSchema, scope: FileResourceScopeSchema, content: z.string() });
export type SkillFileWriteRequest = z.infer<typeof SkillFileWriteRequestSchema>;
export const SkillFileDeleteRequestSchema = z.strictObject({ expectedSourceRevision: CounterSchema, scope: FileResourceScopeSchema });
export type SkillFileDeleteRequest = z.infer<typeof SkillFileDeleteRequestSchema>;
export const SkillFileRenameRequestSchema = z.strictObject({ expectedSourceRevision: CounterSchema, scope: FileResourceScopeSchema, name: FileResourcePathSchema });
export type SkillFileRenameRequest = z.infer<typeof SkillFileRenameRequestSchema>;
export const FileResourceSkillEntrySchema = z.strictObject({ skillId: EntityIdSchema, name: z.string().min(1), description: z.string(), content: z.string(), scope: z.enum(['workspace', 'agent', 'inherited']), readOnly: z.boolean(), source: z.string(), authoredSkillId: FileResourcePathSchema.optional() });
export type FileResourceSkillEntry = z.infer<typeof FileResourceSkillEntrySchema>;
export const FileResourceSkillCatalogSchema = z.strictObject({ workspaceId: EntityIdSchema, skills: z.array(FileResourceSkillEntrySchema) });
export type FileResourceSkillCatalog = z.infer<typeof FileResourceSkillCatalogSchema>;
export const FileResourceSkillExpandRequestSchema = z.strictObject({ skillId: EntityIdSchema, arguments: z.string() });
export type FileResourceSkillExpandRequest = z.infer<typeof FileResourceSkillExpandRequestSchema>;
