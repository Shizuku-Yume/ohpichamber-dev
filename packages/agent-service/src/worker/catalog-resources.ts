import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, readdir, readFile, realpath, rename, unlink } from 'node:fs/promises';

import { removeTemporaryFile } from './temporary-file.ts';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { YAML } from 'bun';
import { z } from 'zod';
import { parseFrontmatter } from '@oh-my-pi/pi-utils';
import { loadSlashCommands, expandSlashCommand } from '@oh-my-pi/pi-coding-agent/extensibility/slash-commands';
import { loadPromptTemplates, expandPromptTemplate } from '@oh-my-pi/pi-coding-agent/config/prompt-templates';
import { loadCapability, type SlashCommand } from '@oh-my-pi/pi-coding-agent/discovery';
import { slashCommandCapability } from '@oh-my-pi/pi-coding-agent/capability/slash-command';
import { reset as resetCapabilities } from '@oh-my-pi/pi-coding-agent/capability';
import { loadSkills, type LoadSkillsOptions } from '@oh-my-pi/pi-coding-agent/extensibility/skills';
import type { EffectiveExtensionRoots } from '@oh-my-pi/pi-coding-agent/capability/types';
import {
  CommandEntrySchema, PromptTemplateEntrySchema, ModelSelectionSchema, EntityIdSchema,
  FileResourceNameSchema, FileResourcePathSchema, CounterSchema, JsonObjectSchema,
  type CommandEntry, type PromptTemplateEntry, type FileResourceScope, type FileResourceSkillEntry,
} from '@openchamber/agent-contract';
import type { FileResourceOperation, FileResourceResult } from '../catalogs/file-resources-protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { buildPublicSkillPrompt, sanitizeSkillRoots } from './catalog-skills.ts';
import { lookupBuiltinSlashCommand } from '@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry';
import { ALLOWED_BUILTIN_COMMANDS, isAllowedBuiltinCommand } from './builtin-commands.ts';

export interface NativeFileResourcesContext {
  cwd: string;
  agentDirectory: string;
  extensionRoots: EffectiveExtensionRoots;
  skillOptions: LoadSkillsOptions;
}
const MetadataSchema = z.object({
  description: z.string().optional(),
  openchamber: z.object({ modelSelection: ModelSelectionSchema.optional(), agentId: EntityIdSchema.optional(), group: z.string().optional() }).optional(),
  'argument-hint': z.string().optional(), argumentHint: z.string().optional(),
});
interface OwnedFile { path: string; name: string; scope: FileResourceScope; text: string; editable: boolean; }
interface ResourceLocation { path: string; scope: FileResourceScope; }
function missing(error: Error): boolean { return 'code' in error && error.code === 'ENOENT'; }
function inside(root: string, path: string): boolean { const part = relative(root, path); return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part); }
function frontmatterBoundary(text: string) {
  // pi-utils repairs leading HTML comments, then closes at the first newline followed by "---".
  const whitespace = /\s*/y;
  let commentsEnd = 0;
  while (whitespace.test(text) && text.startsWith('<!--', whitespace.lastIndex)) {
    const close = text.indexOf('-->', whitespace.lastIndex + 4);
    if (close === -1) break;
    commentsEnd = close + 3;
    whitespace.lastIndex = commentsEnd;
  }
  const prefix = commentsEnd > 0 && text.startsWith('---', whitespace.lastIndex) ? text.slice(0, whitespace.lastIndex) : '';
  const header = /^---[\s\S]*?(?:\r\n?|\n)---(?:[^\S\r\n]*(?:\r\n?|\n|$))?/.exec(text.slice(prefix.length))?.[0];
  return header === undefined ? { prefix: '', header: '' } : { prefix, header: prefix + header };
}
function identity(kind: string, path: string): string { return `${kind}_${createHash('sha256').update(path).digest('hex')}`; }
function denied(): never { throw new ProjectionError(403, 'UNAUTHORIZED', 'Resource is outside an authorable native directory'); }

/** Native discovery and expansion run only here; file IDs never grant arbitrary path access. */
export class NativeFileResources {
  constructor(private readonly context: NativeFileResourcesContext) { }

  private root(scope: FileResourceScope, kind: 'commands' | 'prompts' | 'skills'): string {
    return scope === 'workspace' ? join(this.context.cwd, '.omp', kind) : join(this.context.agentDirectory, kind);
  }
  private async confined(scope: FileResourceScope, path: string, create: boolean): Promise<void> {
    const lexicalBase = scope === 'workspace' ? this.context.cwd : this.context.agentDirectory;
    const base = await realpath(lexicalBase);
    const relativePath = relative(resolve(lexicalBase), resolve(path));
    if (!FileResourcePathSchema.safeParse(relativePath.split(sep).join('/')).success) denied();
    let current = base;
    const parts = relativePath.split(sep);
    for (const [index, part] of parts.entries()) {
      current = join(current, part);
      try {
        const stat = await lstat(current);
        if (stat.isSymbolicLink() || (index < parts.length - 1 && !stat.isDirectory())) denied();
        if (!inside(base, await realpath(current))) denied();
      } catch (error) {
        if (!(error instanceof Error && missing(error))) throw error;
        if (!create) throw error;
        if (index < parts.length - 1) {
          try { await mkdir(current, { mode: 0o700 }); }
          catch (failure) { if (!(failure instanceof Error && 'code' in failure && failure.code === 'EEXIST')) throw failure; }
          const stat = await lstat(current);
          if (!stat.isDirectory() || stat.isSymbolicLink()) denied();
        }
      }
    }
  }
  private async authorable(path: string, kind: 'commands' | 'prompts' | 'skills'): Promise<ResourceLocation | undefined> {
    for (const scope of ['workspace', 'agent'] as const) {
      if (!inside(resolve(this.root(scope, kind)), resolve(path))) continue;
      try { await this.confined(scope, path, false); return { path, scope }; }
      catch (error) { if (error instanceof ProjectionError || (error instanceof Error && missing(error))) return undefined; throw error; }
    }
    return undefined;
  }
  private async owned(kind: 'commands' | 'prompts'): Promise<OwnedFile[]> {
    const files: OwnedFile[] = [];
    for (const scope of ['workspace', 'agent'] as const) {
      const root = this.root(scope, kind);
      const scan = async (directory: string): Promise<void> => {
        let entries;
        try {
          try { await this.confined(scope, directory, false); }
          catch (error) { if (kind !== 'prompts' || !(error instanceof ProjectionError)) throw error; }
          entries = await readdir(directory, { withFileTypes: true });
        } catch (error) { if (error instanceof Error && missing(error)) return; if (error instanceof ProjectionError) return; throw error; }
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
          if (entry.name.startsWith('.')) continue;
          const path = join(directory, entry.name);
          if (entry.isDirectory()) await scan(path);
          else if ((entry.isFile() || (kind === 'prompts' && entry.isSymbolicLink())) && entry.name.endsWith('.md')) {
            const location = await this.authorable(path, kind);
            if (!location && kind !== 'prompts') continue;
            files.push({ path, scope, name: relative(root, path).split(sep).join('/').slice(0, -3), text: await readFile(path, 'utf8'), editable: !!location });
          }
        }
      };
      await scan(root);
    }
    return files;
  }
  private metadata(text: string, path: string) {
    const parsed = parseFrontmatter(text, { source: path, level: 'fatal' });
    const metadata = MetadataSchema.parse(parsed.frontmatter);
    return { content: text.slice(frontmatterBoundary(text).header.length), description: metadata.description, argumentHint: metadata['argument-hint'] ?? metadata.argumentHint, ...metadata.openchamber };
  }
  private async commands() {
    resetCapabilities();
    const options = { cwd: this.context.cwd, extensionRoots: this.context.extensionRoots };
    const native = await loadSlashCommands(options);
    const discovered = await loadCapability<SlashCommand>(slashCommandCapability.id, options);
    if (discovered.warnings?.length) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native command discovery failed');
    const owned = await this.owned('commands');
    const result: Array<{ entry: CommandEntry; path?: string }> = owned.map(file => {
      const data = this.metadata(file.text, file.path);
      const definition = discovered.items.find(item => item.path === file.path);
      const command = native.find(item => item.name === definition?.name && item._source?.providerName === definition?._source.providerName);
      return {
        path: file.path, entry: CommandEntrySchema.parse({
          ...data, commandId: identity('command', file.path), name: definition?.name ?? basename(file.name),
          description: data.description ?? command?.description ?? '', scope: file.scope, source: command?.source ?? file.scope, editable: true
        })
      };
    });
    for (const command of native) {
      const source = discovered.items.find(item => item.name === command.name && item._source.providerName === command._source?.providerName);
      if (source && result.some(item => item.path === source.path)) continue;
      const metadata = source ? this.metadata(await readFile(source.path, 'utf8'), source.path) : {};
      result.push({
        entry: CommandEntrySchema.parse({
          ...metadata, commandId: identity('command', source ? `${source.path}:${command.name}` : `bundled:${command.name}`),
          name: command.name, content: command.content, description: command.description, argumentHint: command.argumentHint,
          scope: 'inherited', source: command.source, editable: false
        })
      });
    }
    const projectedBuiltins = [...ALLOWED_BUILTIN_COMMANDS, 'btw'] as const;
    for (const name of projectedBuiltins) {
      if (result.some(item => item.entry.name === name && item.entry.scope === 'inherited')) continue;
      const spec = lookupBuiltinSlashCommand(name);
      if (!spec) continue;
      // This catalog feeds ACP and the GUI, not the terminal. OMP's TUI
      // description embeds keybinding hints rendered through the active theme
      // (`Shift+Tab` or `⇧⇥` depending on whether a theme was loaded), which is
      // ambient state no client asked for; the ACP copy is the same command
      // described for a client without a keyboard.
      const description = spec.acpDescription ?? spec.description ?? '';
      const argumentHint = spec.acpInputHint ?? spec.inlineHint ?? undefined;
      result.push({
        entry: CommandEntrySchema.parse({
          commandId: identity('command', `builtin:${name}`),
          name,
          description,
          argumentHint,
          content: '',
          scope: 'inherited',
          source: 'builtin',
          editable: false,
        }),
      });
    }
    const ranks = new Map(native.map((command, index) => [`${command.source}\0${command.name}`, index]));
    result.sort((a, b) => (ranks.get(`${a.entry.source}\0${a.entry.name}`) ?? native.length) - (ranks.get(`${b.entry.source}\0${b.entry.name}`) ?? native.length));
    return { entries: result, native, definitions: discovered.items };
  }
  private async templates() {
    const native = await loadPromptTemplates({ cwd: this.context.cwd, agentDir: this.context.agentDirectory });
    const owned = await this.owned('prompts');
    const result: Array<{ entry: PromptTemplateEntry; path?: string }> = owned.map(file => {
      const data = this.metadata(file.text, file.path);
      const directory = file.name.includes('/') ? file.name.slice(0, file.name.lastIndexOf('/')) : '';
      const source = `(${file.scope === 'agent' ? 'user' : 'project'}${directory ? `:${directory.replaceAll('/', ':')}` : ''})`;
      return {
        path: file.editable ? file.path : undefined, entry: PromptTemplateEntrySchema.parse({
          content: data.content, description: data.description ?? '',
          modelSelection: data.modelSelection, agentId: data.agentId, group: data.group ?? (directory || undefined),
          templateId: identity('template', file.path), name: basename(file.name), scope: file.editable ? file.scope : 'inherited', source, editable: file.editable
        })
      };
    });
    for (const [index, template] of native.entries()) {
      if (result.some(item => item.entry.name === template.name && item.entry.content === template.content && item.entry.source === template.source)) continue;
      result.push({ entry: PromptTemplateEntrySchema.parse({ ...template, templateId: identity('template', `${template.source}:${index}:${template.name}`), scope: 'inherited', editable: false }) });
    }
    // Preserve the native loader's user-before-project precedence for raw-text expansion.
    const ranks = new Map(native.map((template, index) => [`${template.source}\0${template.name}`, index]));
    result.sort((a, b) => (ranks.get(`${a.entry.source}\0${a.entry.name}`) ?? native.length) - (ranks.get(`${b.entry.source}\0${b.entry.name}`) ?? native.length));
    return { entries: result, native };
  }
  private async write(kind: 'commands' | 'prompts', request: { name: string; scope: FileResourceScope; content: string; description?: string; argumentHint?: string; modelSelection?: z.infer<typeof ModelSelectionSchema>; agentId?: string | null; group?: string }, current?: ResourceLocation & { entry: CommandEntry | PromptTemplateEntry }): Promise<void> {
    const name = FileResourceNameSchema.parse(request.name);
    const directory = current && current.scope === request.scope && !name.includes('/') ? dirname(current.path) : this.root(request.scope, kind);
    const path = join(directory, `${name}.md`);
    const moving = !!current && resolve(current.path) !== resolve(path);
    await this.confined(request.scope, path, true);
    if (current) await this.confined(current.scope, current.path, false);
    if (!current || moving) {
      try { await lstat(path); throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Resource already exists'); }
      catch (error) { if (!(error instanceof Error && missing(error))) throw error; }
    }
    const previousText = current ? await readFile(current.path, 'utf8') : '';
    const { prefix, header } = frontmatterBoundary(previousText);
    const { description, group } = request;
    const descriptionChanged = description !== undefined && description !== current?.entry.description;
    const argumentHintChanged = request.argumentHint !== undefined && request.argumentHint !== this.metadata(previousText, path).argumentHint;
    const modelChanged = (request.modelSelection !== undefined || kind === 'commands') && !isDeepStrictEqual(request.modelSelection, current?.entry.modelSelection);
    const agentChanged = request.agentId !== undefined && (request.agentId ?? undefined) !== current?.entry.agentId;
    const groupChanged = group !== undefined && group !== current?.entry.group;
    let editedMetadata: z.infer<typeof JsonObjectSchema> | undefined;
    if (descriptionChanged || argumentHintChanged || modelChanged || agentChanged || groupChanged) {
      const frontmatter = JsonObjectSchema.parse(parseFrontmatter(header.slice(prefix.length), {
        source: path, level: 'fatal', repair: false, rawKeys: true,
      }).frontmatter);
      const metadata = { ...frontmatter };
      if (descriptionChanged) metadata.description = description;
      if (argumentHintChanged) {
        delete metadata.argumentHint;
        delete metadata['argument-hint'];
        if (request.argumentHint) metadata['argument-hint'] = request.argumentHint;
      }
      const bindings = JsonObjectSchema.safeParse(frontmatter.openchamber);
      const openchamber = bindings.success ? { ...bindings.data } : {};
      if (modelChanged) {
        delete openchamber['model-selection'];
        if (request.modelSelection) openchamber.modelSelection = request.modelSelection;
        else delete openchamber.modelSelection;
      }
      if (agentChanged) {
        delete openchamber['agent-id'];
        if (request.agentId) openchamber.agentId = request.agentId;
        else delete openchamber.agentId;
      }
      if (groupChanged) openchamber.group = group;
      if (bindings.success || Object.keys(openchamber).length) metadata.openchamber = openchamber;
      if (!isDeepStrictEqual(frontmatter, metadata)) editedMetadata = metadata;
    }
    const nextHeader = editedMetadata === undefined && (header || !request.content.startsWith('---') && !frontmatterBoundary(request.content).header)
      ? header && header === previousText && !/[\r\n]$/.test(header) && request.content ? `${header}\n` : header
      : `${prefix}---\n${YAML.stringify(editedMetadata ?? {}).trimEnd()}\n---\n`;
    const text = nextHeader + request.content;
    const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await file.writeFile(text); await file.sync(); } finally { await file.close(); }
      await this.confined(request.scope, path, true);
      if (current && !moving) await rename(temporary, path);
      else {
        // Linking publishes a complete file without clobbering an external concurrent create.
        await link(temporary, path);
        if (current) {
          try { await this.remove(current); }
          catch (error) { await unlink(path); throw error; }
        }
      }
    } finally { await removeTemporaryFile(temporary); }
  }
  private async remove(location: ResourceLocation): Promise<void> { await this.confined(location.scope, location.path, false); await unlink(location.path); }
  private async skills() {
    resetCapabilities();
    const loaded = await loadSkills({ ...this.context.skillOptions, cwd: this.context.cwd });
    if (loaded.warnings.some(warning => !warning.message.startsWith('name collision:'))) throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'Native skill discovery failed');
    return loaded.skills;
  }
  async operation(operation: FileResourceOperation, workspaceId: string, revision: string): Promise<FileResourceResult> {
    CounterSchema.parse(revision);
    if ('request' in operation && 'expectedRevision' in operation.request && BigInt(revision) !== BigInt(operation.request.expectedRevision) + 1n) throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Resource mutation revision changed');
    if (operation.action === 'skills.read') {
      const skills: FileResourceSkillEntry[] = [];
      for (const skill of await this.skills()) {
        const location = await this.authorable(skill.filePath, 'skills');
        const authoredSkillId = location ? relative(this.root(location.scope, 'skills'), dirname(skill.filePath)).split(sep).join('/') : undefined;
        const authored = FileResourcePathSchema.safeParse(authoredSkillId);
        const entry: FileResourceSkillEntry = {
          skillId: identity('skill', skill.filePath), name: skill.name, description: sanitizeSkillRoots(skill, skill.description, this.context),
          content: await readFile(skill.filePath, 'utf8'), source: skill._source?.providerName ?? 'native',
          scope: location?.scope ?? 'inherited', readOnly: !location || !authored.success
        };
        if (authored.success) entry.authoredSkillId = authored.data;
        skills.push(entry);
      }
      return { kind: 'skills', catalog: { workspaceId, skills } };
    }
    if (operation.action === 'skills.expand') {
      const skill = (await this.skills()).find(item => identity('skill', item.filePath) === operation.request.skillId);
      if (!skill) throw new ProjectionError(404, 'INVALID_REQUEST', 'Skill is not in the native catalog');
      return { kind: 'expanded', result: { content: await buildPublicSkillPrompt(skill, operation.request.arguments, this.context) } };
    }
    if (operation.action === 'input.expand') {
      const text = operation.request.text;
      if (!text.startsWith('/')) return { kind: 'prompt-input', result: { kind: 'text', content: text } };
      const name = text.slice(1).split(' ')[0];
      const commands = await this.commands();
      const command = commands.native.find(item => item.name === name);
      const templates = await this.templates();
      const template = command ? undefined : templates.native.find(item => item.name === name);
      if (!command && !template) return { kind: 'prompt-input', result: { kind: 'text', content: text } };
      const content = expandPromptTemplate(expandSlashCommand(text, commands.native), templates.native);
      if (command) {
        const definition = commands.definitions.find(item => item.name === command.name && item._source.providerName === command._source?.providerName);
        const entry = commands.entries.find(item => (definition && item.path === definition.path) || (item.entry.name === command.name && item.entry.source === command.source))?.entry;
        return { kind: 'prompt-input', result: { kind: 'command', content, modelSelection: entry?.modelSelection, agentId: entry?.agentId } };
      }
      const entry = template ? templates.entries.find(item => item.entry.name === template.name && item.entry.source === template.source)?.entry : undefined;
      return { kind: 'prompt-input', result: { kind: 'template', content, modelSelection: entry?.modelSelection, agentId: entry?.agentId } };
    }
    if (operation.action.startsWith('commands.')) {
      let { entries: commands } = await this.commands();
      if (operation.action === 'commands.expand') {
        const item = commands.find(item => item.entry.commandId === operation.request.commandId);
        if (!item) throw new ProjectionError(404, 'INVALID_REQUEST', 'Command is not in the native catalog');
        const content = item.entry.source === 'builtin'
          ? (operation.request.arguments ? `/${item.entry.name} ${operation.request.arguments}` : `/${item.entry.name}`)
          : expandSlashCommand(`/${item.entry.name} ${operation.request.arguments}`, [item.entry]);
        return { kind: 'expanded', result: { content, modelSelection: item.entry.modelSelection, agentId: item.entry.agentId } };
      }
      if (operation.action === 'commands.create') await this.write('commands', operation.request);
      if (operation.action === 'commands.update' || operation.action === 'commands.delete') {
        const item = commands.find(item => item.entry.commandId === operation.request.commandId);
        if (!item) throw new ProjectionError(404, 'INVALID_REQUEST', 'Command is not in the native catalog');
        if (!item.path || !item.entry.editable || item.entry.scope === 'inherited') denied();
        const location = { path: item.path, scope: item.entry.scope, entry: item.entry };
        if (operation.action === 'commands.update') await this.write('commands', operation.request, location);
        else await this.remove(location);
      }
      commands = (await this.commands()).entries;
      return { kind: 'commands', catalog: { workspaceId, revision, commands: commands.filter(item => item.entry.source !== 'builtin' || isAllowedBuiltinCommand(item.entry.name) || item.entry.name === 'btw').map(item => item.entry), builtinCommands: [...ALLOWED_BUILTIN_COMMANDS] } };
    }
    let { entries: templates } = await this.templates();
    if (operation.action === 'templates.expand') {
      const item = templates.find(item => item.entry.templateId === operation.request.templateId);
      if (!item) throw new ProjectionError(404, 'INVALID_REQUEST', 'Template is not in the native catalog');
      return { kind: 'expanded', result: { content: expandPromptTemplate(`/${item.entry.name} ${operation.request.arguments}`, [item.entry]), modelSelection: item.entry.modelSelection, agentId: item.entry.agentId } };
    }
    if (operation.action === 'templates.expand-text') {
      const text = operation.request.text;
      const item = text.startsWith('/') ? templates.find(item => item.entry.name === text.slice(1).split(' ')[0]) : undefined;
      return { kind: 'expanded', result: { content: expandPromptTemplate(text, templates.map(item => item.entry)), modelSelection: item?.entry.modelSelection, agentId: item?.entry.agentId } };
    }
    if (operation.action === 'templates.create') await this.write('prompts', operation.request);
    if (operation.action === 'templates.update' || operation.action === 'templates.delete') {
      const item = templates.find(item => item.entry.templateId === operation.request.templateId);
      if (!item) throw new ProjectionError(404, 'INVALID_REQUEST', 'Template is not in the native catalog');
      if (!item.path || !item.entry.editable || item.entry.scope === 'inherited') denied();
      const location = { path: item.path, scope: item.entry.scope, entry: item.entry };
      if (operation.action === 'templates.update') await this.write('prompts', operation.request, location);
      else await this.remove(location);
    }
    templates = (await this.templates()).entries;
    return { kind: 'templates', catalog: { workspaceId, revision, templates: templates.map(item => item.entry) } };
  }
}
