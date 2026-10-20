import { describe, expect, test } from 'bun:test';
import {
  CommandEntrySchema, CommandCreateRequestSchema, CommandUpdateRequestSchema, CommandDeleteRequestSchema,
  CommandCatalogStateSchema, PromptTemplateEntrySchema, PromptTemplateCatalogStateSchema,
  PromptTemplateCreateRequestSchema, PromptTemplateUpdateRequestSchema,
  SkillFileCatalogStateSchema, SkillFileReadSchema, SkillFileWriteRequestSchema, SkillFileDeleteRequestSchema,
  SkillFileRenameRequestSchema, FileResourceExpandResultSchema, FileResourceSkillEntrySchema, FileResourcePromptInputResultSchema,
} from './file-resources.ts';

const command = { commandId: 'command_1', name: 'review', description: 'Review work', content: '# Review\n\n$ARGUMENTS\n', scope: 'workspace', source: 'workspace', editable: true, argumentHint: '<target>', agentId: 'reviewer', modelSelection: { providerId: 'provider', modelId: 'model' } };
const template = { templateId: 'template_1', name: 'review', description: 'Review work', content: '# Review\n\n{{arguments}}', scope: 'agent', source: 'agent', editable: true, group: 'Quality' };

describe('native file resource wire contracts', () => {
  test('match kind is authoritative even when native expansion leaves text unchanged', () => {
    expect(FileResourcePromptInputResultSchema.parse({ kind: 'command', content: '/same', agentId: 'agent' }).kind).toBe('command');
    expect(FileResourcePromptInputResultSchema.parse({ kind: 'text', content: '/skill:review\nargs' })).toEqual({ kind: 'text', content: '/skill:review\nargs' });
    expect(FileResourcePromptInputResultSchema.safeParse({ kind: 'text', content: '/raw', agentId: 'agent' }).success).toBe(false);
    expect(FileResourcePromptInputResultSchema.safeParse({ content: '/same' }).success).toBe(false);
  });
  test('roundtrips Markdown, metadata and uint64 catalog revisions without private native objects', () => {
    expect(CommandEntrySchema.parse(command)).toEqual(command);
    expect(CommandCatalogStateSchema.parse({ workspaceId: 'workspace', revision: '18446744073709551615', commands: [command] }).revision).toBe('18446744073709551615');
    expect(PromptTemplateEntrySchema.parse(template)).toEqual(template);
    expect(PromptTemplateCatalogStateSchema.parse({ workspaceId: 'workspace', revision: '9007199254740993', templates: [template] }).templates[0].content).toBe(template.content);
    expect(FileResourceExpandResultSchema.parse({ content: 'Native expanded body', agentId: command.agentId, modelSelection: command.modelSelection })).toMatchObject({ modelSelection: command.modelSelection });
    expect(CommandEntrySchema.safeParse({ ...command, filePath: '/private/root/review.md' }).success).toBe(false);
    expect(CommandEntrySchema.safeParse({ ...command, modelSelection: { providerId: 'provider' } }).success).toBe(false);
    expect(CommandCatalogStateSchema.safeParse({ workspaceId: 'workspace', revision: '01', commands: [] }).success).toBe(false);
    expect(CommandCatalogStateSchema.safeParse({ workspaceId: 'workspace', revision: '18446744073709551616', commands: [] }).success).toBe(false);
    expect(CommandCatalogStateSchema.safeParse({ workspaceId: 'workspace', revision: '1', commands: [command, command] }).success).toBe(false);
  });
  test('all command/template mutation names are confined and require decimal CAS counters', () => {
    const create = { expectedRevision: '0', name: 'review', scope: 'workspace', content: 'Review $1' };
    expect(CommandCreateRequestSchema.parse(create)).toEqual(create);
    expect(CommandUpdateRequestSchema.parse({ ...create, commandId: 'command' }).commandId).toBe('command');
    expect(CommandDeleteRequestSchema.safeParse({ commandId: 'command' }).success).toBe(false);
    expect(PromptTemplateCreateRequestSchema.parse({ ...create, name: 'quality/review' }).name).toBe('quality/review');
    expect(PromptTemplateUpdateRequestSchema.safeParse({ ...create, templateId: 'template', scope: 'inherited' }).success).toBe(false);
    for (const name of ['/etc/passwd', '../escape', 'nested/../../escape', 'nested\\escape', './review', 'nested//review', 'review\0bad']) {
      expect(CommandCreateRequestSchema.safeParse({ ...create, name }).success).toBe(false);
      expect(PromptTemplateCreateRequestSchema.safeParse({ ...create, name }).success).toBe(false);
    }
    for (const expectedRevision of [0, '01', '-1', '18446744073709551616']) expect(CommandCreateRequestSchema.safeParse({ ...create, expectedRevision }).success).toBe(false);
  });
  test('authored skill files keep source revision separate from catalog revisions and reject traversal', () => {
    const read = { workspaceId: 'workspace', skillId: 'quality/review', scope: 'workspace', sourceRevision: '4', filePath: 'assets/checklist.md', content: '# Checklist\n' };
    expect(SkillFileReadSchema.parse(read)).toEqual(read);
    expect(SkillFileCatalogStateSchema.parse({ workspaceId: 'workspace', sources: { workspace: '4', agent: '2' }, skills: [{ skillId: 'quality/review', name: 'Review', scope: 'workspace', files: ['SKILL.md', 'assets/checklist.md'] }] }).sources).toEqual({ workspace: '4', agent: '2' });
    expect(SkillFileWriteRequestSchema.parse({ expectedSourceRevision: '4', scope: 'workspace', content: '' }).content).toBe('');
    expect(SkillFileDeleteRequestSchema.safeParse({ expectedRevision: '4', scope: 'workspace' }).success).toBe(false);
    expect(SkillFileRenameRequestSchema.safeParse({ expectedSourceRevision: '4', scope: 'workspace', name: '../escape' }).success).toBe(false);
    expect(SkillFileReadSchema.safeParse({ ...read, filePath: '../SKILL.md' }).success).toBe(false);
    expect(FileResourceSkillEntrySchema.parse({ skillId: 'native-skill', name: 'review', description: 'Review', content: '# Review', scope: 'inherited', readOnly: true, source: 'native' }).readOnly).toBe(true);
  });
});
