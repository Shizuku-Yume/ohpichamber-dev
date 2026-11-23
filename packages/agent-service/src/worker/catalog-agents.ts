import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile, mkdir, open, rm, realpath } from 'node:fs/promises';
import { join, dirname, relative, isAbsolute, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { YAML } from 'bun';
import { z } from 'zod';
import { loadBundledAgents, parseAgent } from '@oh-my-pi/pi-coding-agent/task/agents';
import { findAllNearestProjectConfigDirs } from '@oh-my-pi/pi-coding-agent/config';
import { isProviderEnabled, isUserSourceEnabled } from '@oh-my-pi/pi-coding-agent/capability';
import { listOmpExtensionRoots } from '@oh-my-pi/pi-coding-agent/discovery/omp-extension-roots';
import { listClaudePluginRoots } from '@oh-my-pi/pi-coding-agent/discovery/helpers';
import { pluginUsesClaudeModelDialect } from '@oh-my-pi/pi-coding-agent/discovery/agent-plugin-format';
import { homedir } from 'node:os';
import type { AgentDefinition } from '@oh-my-pi/pi-coding-agent/task/types';
import type { ModelRegistry } from '@oh-my-pi/pi-coding-agent/config/model-registry';
import type { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';
import type { EffectiveExtensionRoots } from '@oh-my-pi/pi-coding-agent/capability/types';
import { resolveCliModel } from '@oh-my-pi/pi-coding-agent/config/model-resolver';
import { cfgTaskDisabledAgents, cfgTaskAgentModelOverrides } from '@oh-my-pi/pi-coding-agent/task/settings';
import { replaceFileAtomically } from '@oh-my-pi/pi-coding-agent/utils/atomic-file';
import { parseFrontmatter } from '@oh-my-pi/pi-utils';
import { AgentSchema, AgentCatalogSchema, AgentCreateRequestSchema, AgentUpdateRequestSchema, AgentDeleteRequestSchema, AgentMutationResultSchema, parseModelSelector, parseRoleAlias, PositiveCounterSchema, type Agent, type AgentCatalog, type AgentCreateRequest, type AgentUpdateRequest, type AgentDeleteRequest, type AgentMutationResult, formatModelRef } from '@openchamber/agent-contract';
import { ProjectionError } from '../projection/journal.ts';
import type { NativeModels } from './catalog-models.ts';

export type NativeAgentsContext = {
  cwd: string;
  agentDirectory: string;
  models: NativeModels;
  modelRegistry: ModelRegistry;
  settings: Settings;
  extensionRoots: EffectiveExtensionRoots;
  availableToolNames: () => readonly string[];
};
const LegacyOpenChamberMetadataSchema = z.object({
  permissionPresetId: z.string().optional(),
}).passthrough().transform(({ permissionPresetId: _preset, ...rest }) => AgentSchema.parse(rest));

const ProfileMetadataSchema = z.object({
  openchamber: LegacyOpenChamberMetadataSchema.optional(),
});
const FRONTMATTER_HEADER = /^((?:\s*<!--[\s\S]*?-->\s*)*)---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
function profilePath(cwd: string, agentId: string): string {
  return join(cwd, '.omp', 'agents', `profile_${createHash('sha256').update(agentId).digest('hex')}.md`);
}

function missing(error: Error): boolean {
  return 'code' in error && error.code === 'ENOENT';
}

export class NativeAgents {
  constructor(private readonly context: NativeAgentsContext) { }

  private async loadDirectory(directory: string, source: AgentDefinition['source'], ignoreModel = false): Promise<AgentDefinition[]> {
    let files;
    try { files = await readdir(directory, { withFileTypes: true }); }
    catch (error) {
      if (error instanceof Error && missing(error)) return [];
      throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native agent definitions could not be read');
    }
    const definitions: AgentDefinition[] = [];
    for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
      if ((!file.isFile() && !file.isSymbolicLink()) || !file.name.endsWith('.md')) continue;
      try {
        const definition = parseAgent(join(directory, file.name), await readFile(join(directory, file.name), 'utf8'), source, 'fatal');
        if (ignoreModel) definition.model = undefined;
        definitions.push(definition);
      } catch { throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'A native agent definition could not be parsed'); }
    }
    return definitions;
  }

  private async discover(includeDisabled = false): Promise<AgentDefinition[]> {
    await this.context.models.ensurePoliciesCurrent();
    // Use the native discovery roots and precedence, but select this worker's authorized user directory.
    // Native discoverAgents uses the process-global default user directory and masks filesystem failures.
    const project = findAllNearestProjectConfigDirs('agents', this.context.cwd).find(entry => entry.source === '.omp');
    const definitions = project ? await this.loadDirectory(project.path, 'project') : [];
    definitions.push(...await this.loadDirectory(join(this.context.agentDirectory, 'agents'), 'user'));
    if (isProviderEnabled('omp-plugins')) {
      const roots = await listOmpExtensionRoots({ cwd: this.context.cwd, home: homedir(), repoRoot: null, extensionRoots: this.context.extensionRoots });
      for (const root of roots) definitions.push(...await this.loadDirectory(join(root.path, 'agents'), root.level));
    }
    if (isProviderEnabled('claude-plugins')) {
      const { roots } = await listClaudePluginRoots(homedir(), this.context.cwd);
      const allowUser = isUserSourceEnabled('claude-plugins') || isUserSourceEnabled('claude');
      const selected = roots.filter(root => root.scope === 'project' || allowUser || root.origin !== 'claude')
        .sort((a, b) => a.scope === b.scope ? 0 : a.scope === 'project' ? -1 : 1);
      for (const root of selected) definitions.push(...await this.loadDirectory(join(root.path, 'agents'), root.scope,
        root.origin === 'claude' || await pluginUsesClaudeModelDialect(root.path)));
    }
    definitions.push(...loadBundledAgents());
    const seen = new Set<string>();
    const disabled = new Set(cfgTaskDisabledAgents.get(this.context.settings));
    return definitions.filter(agent => {
      if (seen.has(agent.name)) return false;
      seen.add(agent.name);
      return includeDisabled || !disabled.has(agent.name);
    });
  }

  private effectiveModelSelectors(definition: AgentDefinition): AgentDefinition['model'] {
    const override = cfgTaskAgentModelOverrides.get(this.context.settings)[definition.name];
    return override ? Array.isArray(override) ? override : [override] : definition.model;
  }

  private async project(definition: AgentDefinition): Promise<Agent> {
    let metadata: z.infer<typeof ProfileMetadataSchema> = {};
    if (definition.filePath && definition.source !== 'bundled') {
      try {
        const content = await readFile(definition.filePath, 'utf8');
        const { frontmatter } = parseFrontmatter(content, { source: definition.filePath, level: 'fatal', rawKeys: true });
        metadata = ProfileMetadataSchema.parse(frontmatter);
      } catch { throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Agent profile metadata could not be read'); }
    }
    const selector = this.effectiveModelSelectors(definition)?.[0];
    const resolved = selector ? resolveCliModel({ cliModel: selector, modelRegistry: this.context.modelRegistry, settings: this.context.settings }).model : undefined;
    let model: Agent['model'] = resolved ? { providerId: resolved.provider, modelId: resolved.id } : null;
    if (!model && selector) {
      // A selector the registry did not resolve still names a pair: read it
      // with the one grammar so `provider/model:high` keeps its level too.
      const parsed = parseModelSelector(selector);
      if (parsed && !parseRoleAlias(selector)) {
        model = { providerId: parsed.providerId, modelId: parsed.modelId };
      }
    }
    const profile = metadata.openchamber;
    const availableToolNames = this.context.availableToolNames();
    const declaredTools = profile && 'allowedTools' in profile ? profile.allowedTools : undefined;
    const allowedTools = declaredTools !== undefined
      ? declaredTools
      : definition.source === 'bundled'
        ? definition.tools === undefined ? null : definition.tools.filter(toolName => availableToolNames.includes(toolName))
        : definition.tools ?? null;
    const candidate: Agent = {
      agentId: definition.name, name: profile?.name ?? definition.name, description: definition.description,
      model, allowedTools,
    };
    const systemPromptOverride = profile ? profile.systemPromptOverride : definition.systemPrompt || undefined;
    if (systemPromptOverride !== undefined) candidate.systemPromptOverride = systemPromptOverride;
    // `inherit` means the session default; the contract expresses that by omitting the level.
    const configured = profile?.thinkingLevel !== undefined ? profile.thinkingLevel : definition.thinkingLevel;
    if (configured !== undefined && configured !== 'inherit') candidate.thinkingLevel = configured;
    const spawns = profile?.spawns !== undefined ? profile.spawns : definition.spawns;
    if (spawns !== undefined) candidate.spawns = spawns;
    const blocking = profile?.blocking !== undefined ? profile.blocking : definition.blocking;
    if (blocking !== undefined) candidate.blocking = blocking;
    const advisor = profile?.advisor !== undefined ? profile.advisor : definition.advisor;
    if (advisor !== undefined) candidate.advisor = advisor;
    return AgentSchema.parse(candidate);
  }

  async read(workspaceId: string, revision: string): Promise<AgentCatalog> {
    const definitions = await this.discover();
    return AgentCatalogSchema.parse({ workspaceId, revision, agents: await Promise.all(definitions.map(definition => this.project(definition))) });
  }

  async definition(agentId: string): Promise<AgentDefinition> {
    const definition = (await this.discover()).find(agent => agent.name === agentId);
    if (!definition) throw new ProjectionError(404, 'INVALID_REQUEST', 'Agent profile is unavailable');
    const publicAgent = await this.project(definition);
    return {
      ...definition,
      model: this.effectiveModelSelectors(definition),
      systemPrompt: publicAgent.systemPromptOverride ?? definition.systemPrompt,
    };
  }

  async profile(agentId: string): Promise<Agent> {
    return this.project(await this.definition(agentId));
  }

  async create(input: AgentCreateRequest, revision: string): Promise<AgentMutationResult> {
    const request = AgentCreateRequestSchema.parse(input);
    PositiveCounterSchema.parse(revision);
    if ((await this.discover(true)).some(agent => agent.name === request.agent.agentId)) {
      throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Agent profile already exists');
    }
    return this.write(request.agent, revision);
  }

  async update(input: AgentUpdateRequest, revision: string): Promise<AgentMutationResult> {
    const request = AgentUpdateRequestSchema.parse(input);
    PositiveCounterSchema.parse(revision);
    const existing = (await this.discover(true)).find(agent => agent.name === request.agent.agentId);
    if (!existing) throw new ProjectionError(404, 'INVALID_REQUEST', 'Agent profile is unavailable');
    return this.write(request.agent, revision, existing);
  }

  private async assertWorkspacePath(path: string): Promise<void> {
    const root = await realpath(this.context.cwd);
    let ancestor = path;
    while (true) {
      try {
        const escape = relative(root, await realpath(ancestor));
        if (escape.startsWith('..') || isAbsolute(escape)) throw new ProjectionError(403, 'UNAUTHORIZED', 'Agent definition leaves the authorized workspace');
        return;
      } catch (error) {
        if (!(error instanceof Error) || !missing(error)) throw error;
        const parent = dirname(ancestor);
        if (parent === ancestor) throw new ProjectionError(403, 'UNAUTHORIZED', 'Agent definition has no authorized workspace parent');
        ancestor = parent;
      }
    }
  }

  private async write(agent: Agent, revision: string, existing?: AgentDefinition): Promise<AgentMutationResult> {
    const path = existing?.source === 'project' && existing.filePath && resolve(dirname(existing.filePath)) === resolve(this.context.cwd, '.omp', 'agents')
      ? existing.filePath : profilePath(this.context.cwd, agent.agentId);
    const directory = dirname(path);
    await this.assertWorkspacePath(path);
    let previousContent: string | null = null;
    try {
      const fileEscape = relative(await realpath(this.context.cwd), await realpath(path));
      if (fileEscape.startsWith('..') || isAbsolute(fileEscape)) throw new ProjectionError(403, 'UNAUTHORIZED', 'Agent definition leaves the authorized workspace');
      previousContent = await readFile(path, 'utf8');
    } catch (error) { if (!(error instanceof Error) || !missing(error)) throw error; }
    const previous = existing ? await this.project(existing) : undefined;
    const modelChanged = !isDeepStrictEqual(previous?.model, agent.model);
    if (modelChanged && agent.model && !this.context.modelRegistry.find(agent.model.providerId, agent.model.modelId)) {
      throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'Agent profile model is unavailable');
    }
    const header = previousContent?.match(FRONTMATTER_HEADER);
    const content = (() => {
      try {
        if (previousContent !== null && !header) throw new Error('Agent frontmatter cannot be preserved');
        const fields = previousContent === null ? {} : parseFrontmatter(previousContent, {
          source: path, level: 'fatal', rawKeys: true,
        }).frontmatter;
        const set = (key: string, value: Agent[keyof Agent] | undefined) => {
          if (value === undefined) delete fields[key]; else fields[key] = value;
        };
        fields.name = agent.agentId;
        fields.description = agent.description;
        fields.openchamber = agent;
        if (!header || !isDeepStrictEqual(previous?.allowedTools, agent.allowedTools)) set('tools', agent.allowedTools ?? undefined);
        if (modelChanged) set('model', agent.model ? formatModelRef(agent.model) : undefined);
        else if (!header) set('model', existing?.model);
        if (!header || previous?.thinkingLevel !== agent.thinkingLevel) {
          delete fields.thinking;
          delete fields['thinking-level'];
          set('thinkingLevel', agent.thinkingLevel);
        }
        if (!header || !isDeepStrictEqual(previous?.spawns, agent.spawns)) set('spawns', agent.spawns);
        if (!header || previous?.blocking !== agent.blocking) set('blocking', agent.blocking);
        if (!header || previous?.advisor !== agent.advisor) set('advisor', agent.advisor);
        const body = header && previousContent !== null && previous?.systemPromptOverride === agent.systemPromptOverride
          ? previousContent.slice(header[0].length)
          : `\n${agent.systemPromptOverride ?? ''}\n`;
        const updated = `${header?.[1] ?? ''}---\n${YAML.stringify(fields)}\n---\n${body}`;
        parseAgent(path, updated, 'project', 'fatal');
        return updated;
      } catch { throw new ProjectionError(422, 'INVALID_REQUEST', 'Agent profile is not a valid native definition'); }
    })();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const escape = relative(await realpath(this.context.cwd), await realpath(directory));
    if (escape.startsWith('..') || isAbsolute(escape)) throw new ProjectionError(403, 'UNAUTHORIZED', 'Agent definition directory leaves the authorized workspace');
    const previousDisabled = [...cfgTaskDisabledAgents.get(this.context.settings)];
    const previousOverrides = { ...cfgTaskAgentModelOverrides.get(this.context.settings) };
    const result = AgentMutationResultSchema.parse({ revision, agentId: agent.agentId, agent });
    let published = false;
    try {
      await this.persist(path, content);
      published = true;
      cfgTaskDisabledAgents.set(this.context.settings, previousDisabled.filter(id => id !== agent.agentId));
      if (modelChanged && Object.hasOwn(previousOverrides, agent.agentId)) {
        const overrides = { ...previousOverrides };
        delete overrides[agent.agentId];
        cfgTaskAgentModelOverrides.set(this.context.settings, overrides);
      }
      await this.context.settings.flush();
    } catch {
      if (published) {
        try {
          if (previousContent === null) await rm(path, { force: true }); else await this.persist(path, previousContent);
          cfgTaskDisabledAgents.set(this.context.settings, previousDisabled);
          cfgTaskAgentModelOverrides.set(this.context.settings, previousOverrides);
          await this.context.settings.flush();
        } catch { throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Previous agent profile could not be restored'); }
      }
      throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Agent profile could not be committed');
    }
    return result;
  }

  private async persist(path: string, content: string): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(content, 'utf8'); await file.sync(); } finally { await file.close(); }
      await replaceFileAtomically(temporary, path);
    } finally { await rm(temporary, { force: true }); }
  }

  async delete(input: AgentDeleteRequest, revision: string): Promise<AgentMutationResult> {
    const request = AgentDeleteRequestSchema.parse(input);
    PositiveCounterSchema.parse(revision);
    const existing = (await this.discover()).find(agent => agent.name === request.agentId);
    if (!existing) throw new ProjectionError(404, 'INVALID_REQUEST', 'Agent profile is unavailable');
    const previous = [...cfgTaskDisabledAgents.get(this.context.settings)];
    const definitionPath = existing.source === 'project' && existing.filePath && resolve(dirname(existing.filePath)) === resolve(this.context.cwd, '.omp', 'agents')
      ? existing.filePath : profilePath(this.context.cwd, request.agentId);
    await this.assertWorkspacePath(definitionPath);
    let content: string | undefined;
    const result = AgentMutationResultSchema.parse({ revision, agentId: request.agentId, agent: null });
    try {
      // The native disable list also hides a bundled/user/plugin definition revealed by removing an override.
      cfgTaskDisabledAgents.set(this.context.settings, [...new Set([...previous, request.agentId])]);
      await this.context.settings.flush();
      try { content = await readFile(definitionPath, 'utf8'); }
      catch (error) { if (!(error instanceof Error) || !missing(error)) throw error; }
      if (content !== undefined) await rm(definitionPath);
    } catch {
      cfgTaskDisabledAgents.set(this.context.settings, previous);
      try { await this.context.settings.flush(); }
      catch { throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Previous agent visibility could not be restored'); }
      throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Agent profile could not be deleted');
    }
    return result;
  }
}
