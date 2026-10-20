import { buildSkillPromptMessage, loadSkills, setActiveSkills, type LoadSkillsOptions, type Skill } from '@oh-my-pi/pi-coding-agent/extensibility/skills';
import { reset as resetCapabilities } from '@oh-my-pi/pi-coding-agent/capability';
import { ProjectionError } from '../projection/journal.ts';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { findRepoRoot } from '@oh-my-pi/pi-coding-agent/capability/fs';
import { isProviderEnabled, isUserSourceEnabled } from '@oh-my-pi/pi-coding-agent/capability';
import { getAncestorDirs } from '@oh-my-pi/pi-coding-agent/discovery/builtin';
import { getUserPathCandidates, getProjectPathCandidates } from '@oh-my-pi/pi-coding-agent/discovery/agents';
import { resolveUserPath, getUserPath, getProjectPath, listClaudePluginRoots, clearClaudePluginRootsCache, type ClaudePluginRoot } from '@oh-my-pi/pi-coding-agent/discovery/helpers';
import { listOmpExtensionRoots } from '@oh-my-pi/pi-coding-agent/discovery/omp-extension-roots';
import { getManagedSkillsDir } from '@oh-my-pi/pi-coding-agent/autolearn/managed-skills';
import { expandTilde } from '@oh-my-pi/pi-coding-agent/tools/path-utils';
import { legacyProviderAllowed } from '@oh-my-pi/pi-coding-agent/discovery/agent-plugin-format';
import { readSkillsLock, readStoredIntegrity, getSkillStorePath, parseSkillId, SKILLS_LOCK_FILE } from '@oh-my-pi/pi-coding-agent/skillshare/manifest';
import {
  CatalogOperationErrorSchema,
  CatalogWorkerIdentitySchema,
  EntityIdSchema,
  SkillExpandRequestSchema,
  SkillExpandResultSchema,
  SkillSourceRevisionsSchema,
  SkillsCatalogStateSchema,
  SkillsWorkerApplyOutcomeSchema,
  PositiveCounterSchema,
  JsonObjectSchema, type JsonObject,
  type CatalogOperationError,
  type CatalogWorkerIdentity,
  type SkillExpandRequest,
  type SkillExpandResult,
  type SkillSourceRevisions,
  type SkillsCatalogState,
  type SkillsWorkerApplyOutcome,
} from '@openchamber/agent-contract';

export type WorkerSkillsContext = {
  worker: CatalogWorkerIdentity;
  agentDirectoryId: string;
  cwd: string;
  agentDirectory: string;
  options: LoadSkillsOptions;
  publishSkills: (skills: Skill[]) => Promise<void>;
  setSkillsRuntimeAvailable: (available: boolean) => void;
};

function errorDetail(): CatalogOperationError {
  return CatalogOperationErrorSchema.parse({ code: 'SKILLS_LOAD_FAILED', detail: 'Unable to load skills.', retryable: true });
}

function publicScope(skill: Skill): 'workspace' | 'agent' {
  switch (skill._source?.level) {
    case 'project': return 'workspace';
    case 'user': case 'native': return 'agent';
    default: throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'Native skill source scope is unavailable');
  }
}

export function sanitizeSkillRoots(skill: Skill, text: string, context: Pick<WorkerSkillsContext, 'cwd' | 'agentDirectory'>): string {
  const roots = [skill.filePath, skill.baseDir, skill.containRoot, context.cwd, context.agentDirectory]
    .filter((root): root is string => root !== undefined && root.length > 0).sort((a, b) => b.length - a.length);
  for (const root of roots) text = text.split(root).join('[skill-root]');
  return text;
}

export async function buildPublicSkillPrompt(skill: Skill, args: string, context: Pick<WorkerSkillsContext, 'cwd' | 'agentDirectory'>): Promise<string> {
  const built = await buildSkillPromptMessage({ ...skill, baseDir: `skill://${skill.name}` }, { args }, 'user');
  return sanitizeSkillRoots(skill, built.message, context);
}

export class WorkerSkills {
  private readonly context: WorkerSkillsContext;
  private skills: Skill[] = [];
  private appliedSources: SkillSourceRevisions | null = null;
  private catalogRevision = '0';
  private runtimeStatus: SkillsCatalogState['runtimeStatus'] = 'unavailable';

  constructor(context: WorkerSkillsContext) {
    this.context = context;
  }

  read(persistedSources: SkillSourceRevisions): SkillsCatalogState {
    const parsedSources = SkillSourceRevisionsSchema.parse(persistedSources);
    CatalogWorkerIdentitySchema.parse(this.context.worker);
    return SkillsCatalogStateSchema.parse({
      worker: this.context.worker,
      agentDirectoryId: this.context.agentDirectoryId,
      runtimeStatus: this.runtimeStatus,
      persistedSources: parsedSources,
      appliedSources: this.appliedSources,
      catalogRevision: this.catalogRevision,
      skills: this.appliedSources ? this.skills.map(skill => ({ skillId: skill.name, name: skill.name, description: sanitizeSkillRoots(skill, skill.description, this.context), scope: publicScope(skill) })) : [],
    });
  }

  private async checkSkillFile(path: string): Promise<void> {
    try { await readFile(path, 'utf8'); }
    catch (error) {
      if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return;
      throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'A native skill file could not be read');
    }
  }

  private async checkDirectory(directory: string): Promise<void> {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
      throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'A native skill directory could not be read');
    }
    // Native scanSkillsFromDir examines the root and direct child SKILL.md files, not asset trees.
    await this.checkSkillFile(join(directory, 'SKILL.md'));
    for (const entry of entries) {
      if (!entry.name.startsWith('.') && (entry.isDirectory() || entry.isSymbolicLink())) {
        await this.checkSkillFile(join(directory, entry.name, 'SKILL.md'));
      }
    }
  }

  private async readManifest(path: string): Promise<JsonObject | null> {
    try { return JsonObjectSchema.parse(JSON.parse(await readFile(path, 'utf8'))); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'A native plugin skill manifest could not be read');
    }
  }

  private async legacyPluginDirectories(root: ClaudePluginRoot): Promise<string[]> {
    const manifests = [await this.readManifest(join(root.path, '.claude-plugin', 'plugin.json'))];
    let marketplaceSelection: JsonObject | null = null;
    for (const path of [join(root.path, 'marketplace.json'), join(root.path, '.omp-plugin', 'marketplace.json'), join(root.path, '.claude-plugin', 'marketplace.json')]) {
      const marketplace = await this.readManifest(path);
      if (!Array.isArray(marketplace?.plugins)) continue;
      for (const candidate of marketplace.plugins) {
        const parsed = JsonObjectSchema.safeParse(candidate);
        if (parsed.success && parsed.data.name === root.plugin && parsed.data.source === './') {
          marketplaceSelection = parsed.data;
          break;
        }
      }
      if (marketplaceSelection) break;
    }
    if (marketplaceSelection) manifests.push(marketplaceSelection);
    const configured: string[] = [];
    for (const manifest of manifests) {
      const candidates = Array.isArray(manifest?.skills) ? manifest.skills : [manifest?.skills];
      for (const candidate of candidates) {
        const parsedPath = EntityIdSchema.safeParse(candidate);
        if (!parsedPath.success || !parsedPath.data.trim()) continue;
        const target = resolve(root.path, parsedPath.data.trim());
        const escape = relative(root.path, target);
        if (escape.startsWith('..') || isAbsolute(escape)) throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'A native plugin skill directory leaves its package');
        configured.push(target);
      }
    }
    return configured.length === 0 ? [join(root.path, 'skills')]
      : [...new Set([...(marketplaceSelection ? [] : [join(root.path, 'skills')]), ...configured])];
  }

  private async checkLock(path: string): Promise<void> {
    const lock = await readSkillsLock(path);
    for (const [id, entry] of Object.entries(lock.skills)) {
      const parsed = parseSkillId(id);
      if (!parsed) throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'A native locked skill identity is invalid');
      const directory = getSkillStorePath(parsed.scope, parsed.name, entry.version);
      if (await readStoredIntegrity(directory) !== entry.integrity) throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'A native locked skill package is unavailable');
      await readFile(join(directory, 'SKILL.md'), 'utf8');
    }
  }

  private async preflight(): Promise<void> {
    const options = this.context.options;
    if (options.enabled === false) return;
    const ctx = { cwd: this.context.cwd, home: homedir(), repoRoot: await findRepoRoot(this.context.cwd) };
    const selectedNativeRoot = join(this.context.agentDirectory, 'skills');
    if (resolve(resolveUserPath(ctx, 'native', 'skills')!) !== resolve(selectedNativeRoot)) {
      throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'Native skill discovery is not scoped to this worker agent directory');
    }
    const roots = new Set<string>();
    if (isProviderEnabled('native')) {
      if (options.enablePiUser !== false) roots.add(selectedNativeRoot);
      if (options.enablePiProject !== false) {
        for (const ancestor of getAncestorDirs(ctx.cwd, ctx.repoRoot ?? ctx.home)) {
          if (resolve(ancestor.dir) !== resolve(ctx.home)) roots.add(join(ancestor.dir, '.omp', 'skills'));
        }
      }
    }
    roots.add(getManagedSkillsDir(this.context.agentDirectory));
    if (isProviderEnabled('agents')) {
      if (options.enableAgentsUser !== false) for (const root of getUserPathCandidates(ctx, 'skills')) roots.add(root);
      if (options.enableAgentsProject !== false) for (const root of getProjectPathCandidates(ctx, 'skills')) roots.add(root);
    }
    for (const source of ['claude', 'codex'] as const) {
      if (!isProviderEnabled(source)) continue;
      const userEnabled = source === 'claude' ? options.enableClaudeUser || isUserSourceEnabled(source)
        : options.enableCodexUser || isUserSourceEnabled(source);
      if (userEnabled) { const root = resolveUserPath(ctx, source, 'skills'); if (root) roots.add(root); }
      if (source === 'claude') {
        if (options.enableClaudeProject !== false) for (const ancestor of getAncestorDirs(ctx.cwd, ctx.repoRoot ?? ctx.home)) {
          if (resolve(ancestor.dir) !== resolve(ctx.home)) roots.add(join(ancestor.dir, '.claude', 'skills'));
        }
      } else {
        const root = getProjectPath(ctx, source, 'skills'); if (root) roots.add(root);
      }
    }
    for (const source of ['github', 'opencode'] as const) {
      if (!isProviderEnabled(source)) continue;
      const projectRoot = getProjectPath(ctx, source, 'skills');
      if (projectRoot) roots.add(projectRoot);
      const userRoot = getUserPath(ctx, source, 'skills');
      if (userRoot) roots.add(userRoot);
    }
    if (isProviderEnabled('omp-plugins') || isProviderEnabled('agent-plugins')) {
      const extensions = await listOmpExtensionRoots({ ...ctx, extensionRoots: options.extensionRoots });
      for (const root of extensions) roots.add(join(root.path, 'skills'));
    }
    if (isProviderEnabled('claude-plugins') || isProviderEnabled('agent-plugins')) {
      const plugins = await listClaudePluginRoots(ctx.home, ctx.cwd);
      if (plugins.warnings.length > 0) throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'Native skill plugin roots could not be loaded');
      for (const root of plugins.roots) {
        if (root.scope !== 'project' && root.origin === 'claude' && !options.enableClaudeUser && !isUserSourceEnabled('claude') && !isUserSourceEnabled('claude-plugins')) continue;
        if (isProviderEnabled('claude-plugins') && await legacyProviderAllowed(root.path, 'skills')) {
          for (const directory of await this.legacyPluginDirectories(root)) roots.add(directory);
        } else if (isProviderEnabled('agent-plugins')) roots.add(join(root.path, 'skills'));
      }
    }
    if (isProviderEnabled('skillshare')) {
      for (const ancestor of getAncestorDirs(ctx.cwd, ctx.repoRoot ?? ctx.home)) await this.checkLock(join(ancestor.dir, '.omp', SKILLS_LOCK_FILE));
      await this.checkLock(join(this.context.agentDirectory, SKILLS_LOCK_FILE));
    }
    for (const root of options.customDirectories ?? []) roots.add(resolve(ctx.cwd, expandTilde(root)));
    for (const root of roots) await this.checkDirectory(root);
  }

  async apply(sources: SkillSourceRevisions, catalogRevision: string): Promise<SkillsWorkerApplyOutcome> {
    const parsedSources = SkillSourceRevisionsSchema.parse(sources);
    PositiveCounterSchema.parse(catalogRevision);
    if (BigInt(catalogRevision) <= BigInt(this.catalogRevision)
      || this.appliedSources && (BigInt(parsedSources.workspace) < BigInt(this.appliedSources.workspace)
        || BigInt(parsedSources.agent) < BigInt(this.appliedSources.agent))) {
      throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Skill application does not follow the current source publication');
    }
    let publishing = false;
    try {
      resetCapabilities();
      clearClaudePluginRootsCache();
      await this.preflight();
      const result = await loadSkills({ ...this.context.options, cwd: this.context.cwd });
      if (result.warnings.some(warning => !warning.message.startsWith('name collision:'))) {
        throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'A native skill provider could not be loaded');
      }
      SkillsCatalogStateSchema.parse({ worker: this.context.worker, agentDirectoryId: this.context.agentDirectoryId,
        runtimeStatus: 'ready', persistedSources: parsedSources, appliedSources: parsedSources, catalogRevision,
        skills: result.skills.map(skill => ({ skillId: skill.name, name: skill.name, description: sanitizeSkillRoots(skill, skill.description, this.context), scope: publicScope(skill) })) });
      const outcome = SkillsWorkerApplyOutcomeSchema.parse({ worker: this.context.worker, outcome: 'applied',
        revisions: { runtimeStatus: 'ready', persistedSources: parsedSources, appliedSources: parsedSources, catalogRevision } });
      publishing = true;
      await this.context.publishSkills(result.skills);
      setActiveSkills(result.skills);
      this.context.setSkillsRuntimeAvailable(true);
      this.skills = result.skills;
      this.appliedSources = parsedSources;
      this.catalogRevision = catalogRevision;
      this.runtimeStatus = 'ready';
      return outcome;
    } catch {
      if (publishing) {
        // The SDK has no public snapshot setter. A failed native refresh is unusable until reapply.
        this.runtimeStatus = 'unavailable';
        setActiveSkills([]);
        this.context.setSkillsRuntimeAvailable(false);
      }
      return SkillsWorkerApplyOutcomeSchema.parse({ worker: this.context.worker, outcome: 'failed',
        revisions: { runtimeStatus: this.runtimeStatus, persistedSources: parsedSources,
          appliedSources: this.appliedSources, catalogRevision: this.catalogRevision },
        error: CatalogOperationErrorSchema.parse(errorDetail()) });
    }
  }

  async expand(request: SkillExpandRequest): Promise<SkillExpandResult> {
    const parsedRequest = SkillExpandRequestSchema.parse(request);
    if (parsedRequest.workerGeneration !== this.context.worker.workerGeneration || parsedRequest.catalogRevision !== this.catalogRevision || !this.appliedSources) {
      throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Skill expansion refers to an obsolete worker catalog');
    }
    if (this.runtimeStatus !== 'ready') throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'Native skill runtime is unavailable until successful reapplication');
    const skill = this.skills.find(candidate => candidate.name === parsedRequest.skillId);
    if (!skill) throw new ProjectionError(404, 'INVALID_REQUEST', 'Skill is not in the published catalog');
    return SkillExpandResultSchema.parse({ worker: this.context.worker, skillId: skill.name, catalogRevision: this.catalogRevision,
      message: await buildPublicSkillPrompt(skill, parsedRequest.arguments, this.context) });
  }

  async preparePrompt(skillId: string, args: string): Promise<string> {
    return (await this.expand({ skillId, arguments: args, workerGeneration: this.context.worker.workerGeneration,
      catalogRevision: this.catalogRevision })).message;
  }

}