import { z } from 'zod';
import {
  CommandCreateRequestSchema, CommandUpdateRequestSchema, CommandDeleteRequestSchema,
  PromptTemplateCreateRequestSchema, PromptTemplateUpdateRequestSchema, PromptTemplateDeleteRequestSchema,
  CommandExpandRequestSchema, PromptTemplateExpandRequestSchema, FileResourceExpandTextRequestSchema,
  CommandCatalogStateSchema, PromptTemplateCatalogStateSchema, FileResourceExpandResultSchema,
  FileResourceSkillCatalogSchema, FileResourceSkillExpandRequestSchema, FileResourcePromptInputResultSchema,
  BehaviorFileCatalogSchema, BehaviorFileWriteSchema, BehaviorFileDeleteSchema,
} from '@openchamber/agent-contract';

export const FileResourceOperationSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('input.expand'), request: FileResourceExpandTextRequestSchema }),
  z.strictObject({ action: z.literal('commands.read') }),
  z.strictObject({ action: z.literal('commands.create'), request: CommandCreateRequestSchema }),
  z.strictObject({ action: z.literal('commands.update'), request: CommandUpdateRequestSchema }),
  z.strictObject({ action: z.literal('commands.delete'), request: CommandDeleteRequestSchema }),
  z.strictObject({ action: z.literal('commands.expand'), request: CommandExpandRequestSchema }),
  z.strictObject({ action: z.literal('templates.read') }),
  z.strictObject({ action: z.literal('templates.create'), request: PromptTemplateCreateRequestSchema }),
  z.strictObject({ action: z.literal('templates.update'), request: PromptTemplateUpdateRequestSchema }),
  z.strictObject({ action: z.literal('templates.delete'), request: PromptTemplateDeleteRequestSchema }),
  z.strictObject({ action: z.literal('templates.expand'), request: PromptTemplateExpandRequestSchema }),
  z.strictObject({ action: z.literal('templates.expand-text'), request: FileResourceExpandTextRequestSchema }),
  z.strictObject({ action: z.literal('skills.read') }),
  z.strictObject({ action: z.literal('skills.expand'), request: FileResourceSkillExpandRequestSchema }),
  z.strictObject({ action: z.literal('behavior.read') }),
  z.strictObject({ action: z.literal('behavior.write'), request: BehaviorFileWriteSchema }),
  z.strictObject({ action: z.literal('behavior.delete'), request: BehaviorFileDeleteSchema }),
]);
export type FileResourceOperation = z.infer<typeof FileResourceOperationSchema>;
export const FileResourceResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('prompt-input'), result: FileResourcePromptInputResultSchema }),
  z.strictObject({ kind: z.literal('commands'), catalog: CommandCatalogStateSchema }),
  z.strictObject({ kind: z.literal('templates'), catalog: PromptTemplateCatalogStateSchema }),
  z.strictObject({ kind: z.literal('expanded'), result: FileResourceExpandResultSchema }),
  z.strictObject({ kind: z.literal('skills'), catalog: FileResourceSkillCatalogSchema }),
  z.strictObject({ kind: z.literal('behavior'), catalog: BehaviorFileCatalogSchema }),
]);
export type FileResourceResult = z.infer<typeof FileResourceResultSchema>;
