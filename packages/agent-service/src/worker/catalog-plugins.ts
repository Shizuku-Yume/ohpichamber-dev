import { lstat, mkdir, opendir, readFile, realpath, rm, stat, writeFile, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { getAgentDir, getConfigDirName, getConfigRootDir, getPluginsDir, getPluginsLockfile, getPluginsPackageJson, getPluginsNodeModules, getProjectPluginOverridesPath, normalizePathForComparison } from '@oh-my-pi/pi-utils';
import { PluginManager, validateSetting } from '@oh-my-pi/pi-coding-agent/extensibility/plugins/manager';
import { getConfigDirPaths } from '@oh-my-pi/pi-coding-agent/config';
import type { InstalledPlugin } from '@oh-my-pi/pi-coding-agent/extensibility/plugins/types';
import type { MarketplacePluginEntry } from '@oh-my-pi/pi-coding-agent/extensibility/plugins/marketplace';
import {
  MarketplaceManager, classifySource, readMarketplacesRegistry, writeMarketplacesRegistry,
  buildPluginId, parsePluginId, getInstalledPluginsRegistryPath, getMarketplacesRegistryPath,
  getMarketplacesCacheDir, getPluginsCacheDir
} from '@oh-my-pi/pi-coding-agent/extensibility/plugins/marketplace';
import { clearPluginRootsAndCaches, getProjectDiscoveryCeilings, isUserConfigRoot, resolveOrDefaultProjectRegistryPath } from '@oh-my-pi/pi-coding-agent/discovery/helpers';
import type { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';
import type { EffectiveExtensionRoots } from '@oh-my-pi/pi-coding-agent/capability/types';
import { NativeExtensions } from './catalog-extensions.ts';
import {
  MarketplacePluginDetailsSchema, MarketplaceErrorDetailsSchema, JsonObjectSchema, type JsonObject, type InstalledPluginEntry, type PluginTarget, type PluginSettingDefinition,
  type CatalogWorkerIdentity, type PluginCatalogState, type MarketplaceEntry, type MarketplaceSource,
  type MarketplaceErrorCode, type MarketplaceErrorDetails, type MarketplaceSourceFailure,
  type PluginUpdateCheckEntry, type PluginUpgradePreviewEntry, type MarketplacePluginDetails, type PluginLifecycleState
} from '@openchamber/agent-contract';
import type { NativePluginOperation, NativePluginResult } from '../catalogs/plugins.ts';
import { ProjectionError } from '../projection/journal.ts';
import { PluginLocalSource } from './plugin-local-source.ts';
import { removeTemporaryFile } from './temporary-file.ts';

export interface NativePluginsContext {
  cwd: string;
  agentDirectory: string;
  worker: CatalogWorkerIdentity;
  /** The worker's existing native settings instance; never a second authority. */
  settings: Settings;
  /** Current native extension roots, read when the inventory is projected. */
  extensionRoots: EffectiveExtensionRoots;
}
const NativePluginConfigSchema = z.object({
  plugins: z.record(z.string(), z.object({ version: z.string(), enabledFeatures: z.array(z.string()).nullable(), enabled: z.boolean() })).optional(),
  settings: z.record(z.string(), JsonObjectSchema).optional(),
});
const NativePluginPackageSchema = z.object({ dependencies: z.record(z.string(), z.string()).optional() });
const NativePackageName = /^(?:@[a-zA-Z0-9-~][a-zA-Z0-9-._~]*\/)?[a-zA-Z0-9-~][a-zA-Z0-9-._~]*$/;
const NativePluginOverridesSchema = z.looseObject({
  disabled: z.array(z.string()).optional(),
  features: z.record(z.string(), z.array(z.string())).optional(), settings: z.record(z.string(), JsonObjectSchema).optional()
});

/** Catalog entries also carry install sources; only manifest metadata becomes public detail. */
function marketplaceDetails(entry: MarketplacePluginEntry): { details?: MarketplacePluginDetails } {
  const details: MarketplacePluginDetails = {};
  if (entry.author !== undefined) details.author = entry.author;
  if (entry.homepage !== undefined) details.homepage = entry.homepage;
  if (entry.repository !== undefined) details.repository = entry.repository;
  if (entry.license !== undefined) details.license = entry.license;
  if (entry.keywords !== undefined) details.keywords = entry.keywords;
  if (entry.category !== undefined) details.category = entry.category;
  if (entry.tags !== undefined) details.tags = entry.tags;
  if (entry.commands !== undefined) details.commands = entry.commands;
  if (entry.agents !== undefined) details.agents = entry.agents;
  // Manifest maps are native `Record<string, unknown>`; the contract admits JSON only.
  for (const key of ['hooks', 'mcpServers', 'lspServers', 'dapAdapters'] as const) {
    const value = entry[key];
    if (value !== undefined) Object.assign(details, { [key]: jsonCapability(value) });
  }
  if (Object.keys(details).length === 0) return {};
  return { details: MarketplacePluginDetailsSchema.parse(details) };
}

function jsonCapability(value: string | string[] | Record<string, unknown>): string | string[] | JsonObject {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(item => String(item));
  return JsonObjectSchema.parse(value);
}

function pluginId(target: PluginTarget): string {
  return `plugin-${createHash('sha256').update(JSON.stringify(target)).digest('hex')}`;
}
async function readNativePluginFile<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
  try { return schema.parse(JSON.parse(await readFile(path, 'utf8'))); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native plugin state could not be read');
  }
}
async function fileEntry(path: string, inspect = lstat) {
  try { return await inspect(path); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}
async function hasAncestorGitRoot(cwd: string): Promise<boolean> {
  const ceilings = getProjectDiscoveryCeilings();
  for (let dir = cwd; !ceilings.has(normalizePathForComparison(dir)); dir = dirname(dir)) {
    if (!isUserConfigRoot(dir) && await fileEntry(join(dir, '.git'), stat)) return dir !== cwd;
    if (dirname(dir) === dir) break;
  }
  return false;
}
async function filesystemDistinguishesCase(directory: string): Promise<boolean> {
  try {
    const entries = await opendir(directory);
    for await (const { name } of entries) {
      const alternate = name.replace(/[a-z]/i, letter => letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase());
      if (name === alternate) continue;
      const original = await lstat(join(directory, name));
      const alias = await fileEntry(join(directory, alternate));
      return alias === null || alias.dev !== original.dev || alias.ino !== original.ino;
    }
  } catch { return false; }
  return false;
}
function publicSettings(values: JsonObject, definitions: PluginSettingDefinition[]): JsonObject {
  return Object.fromEntries(definitions.filter(setting => !setting.secret && Object.hasOwn(values, setting.key))
    .map(setting => [setting.key, values[setting.key]!]));
}

function expandTildePath(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2));
  return path;
}

function replacePathPrefix(text: string, prefix: string, replacement: string): string {
  const normalized = prefix.replace(/[\\/]+$/, '');
  if (normalized === '') return text;
  let result = '';
  let index = 0;
  while (index < text.length) {
    const match = text.indexOf(normalized, index);
    if (match === -1) { result += text.slice(index); break; }
    const nextChar = text[match + normalized.length];
    const boundaryAfter = nextChar === undefined || '/\\"\'`)]}>:,;'.includes(nextChar) || /\s/.test(nextChar);
    const prevChar = match === 0 ? undefined : text[match - 1];
    const boundaryBefore = prevChar === undefined || '"\'`([{<=:,;'.includes(prevChar) || /\s/.test(prevChar)
      || (prevChar === '/' && text.slice(Math.max(0, match - 3), match) === '://');
    if (boundaryBefore && boundaryAfter) {
      result += `${text.slice(index, match)}${replacement}`;
      index = match + normalized.length;
    } else {
      result += text.slice(index, match + 1);
      index = match + 1;
    }
  }
  return result;
}

function sanitizeMarketplaceText(text: string): string {
  const internalRoots = Array.from(new Set([
    getMarketplacesCacheDir(), getPluginsCacheDir(), getPluginsDir(), getConfigRootDir(), getAgentDir(), dirname(getMarketplacesRegistryPath()),
  ].filter(root => root.trim().length > 0))).sort((left, right) => right.length - left.length);
  let sanitized = text;
  for (const root of internalRoots) sanitized = replacePathPrefix(sanitized, root, '[native plugin location]');
  const homeRoots = Array.from(new Set([homedir(), process.env.HOME ?? ''].filter(root => root.trim().length > 0))).sort((left, right) => right.length - left.length);
  for (const home of homeRoots) sanitized = replacePathPrefix(sanitized, home, '~');
  return sanitized.replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^/\s@]+)@/g, '$1[redacted]@').replace(/\s+/g, ' ').trim();
}

function marketplaceStatus(code: MarketplaceErrorCode): number {
  switch (code) {
    case 'MARKETPLACE_SOURCE_MISSING': return 404;
    case 'MARKETPLACE_SOURCE_EXISTS': return 409;
    case 'MARKETPLACE_INVALID_SOURCE': return 400;
    case 'MARKETPLACE_NETWORK_ERROR': return 502;
  }
}

const CaughtCauseSchema = z.object({ code: z.string() });
const CaughtFailureSchema = z.union([
  z.instanceof(Error).transform(error => ({
    message: error.message,
    errno: CaughtCauseSchema.safeParse(error).data?.code ?? CaughtCauseSchema.safeParse(error.cause).data?.code,
  })),
  z.string().transform(message => ({ message, errno: undefined })),
]).catch({ message: '', errno: undefined });

interface ParsedCaughtFailure { message: string; errno?: string; }
interface MarketplaceFailureContext { action: MarketplaceErrorDetails['action']; sourceName?: string; sourceUri?: string; }
interface ClassifiedMarketplaceFailure { code: MarketplaceErrorCode; detail: string; sourceName?: string; sourceUri?: string; }
interface MarketplaceErrorInput {
  code: MarketplaceErrorCode; action: MarketplaceErrorDetails['action']; detail: string;
  sourceName?: string; sourceUri?: string; updatedCount?: number; failures?: MarketplaceSourceFailure[];
}

function classifyMarketplaceFailure(failure: ParsedCaughtFailure, context: MarketplaceFailureContext): ClassifiedMarketplaceFailure {
  const { message: rawMessage, errno } = failure;
  const sanitizedUri = context.sourceUri ? sanitizeMarketplaceText(context.sourceUri) : undefined;
  const namedMatch = /Marketplace "([^"]+)" (?:already exists|not found)|conflicts with existing marketplace "([^"]+)"|Marketplace catalog name changed from "([^"]+)"/.exec(rawMessage);
  const sourceName = context.sourceName ?? namedMatch?.[1] ?? namedMatch?.[2] ?? namedMatch?.[3];
  const cleaned = sanitizeMarketplaceText(rawMessage);
  const fallbackTarget = sourceName ?? sanitizedUri ?? 'unknown';
  if (/already exists|conflicts with existing marketplace/i.test(rawMessage)) {
    return { code: 'MARKETPLACE_SOURCE_EXISTS', detail: cleaned || `Marketplace source "${fallbackTarget}" already exists.`, sourceName, sourceUri: sanitizedUri };
  }
  const isCatalogValidationFailure = /Unrecognized source format|Failed to parse marketplace catalog|must be a JSON object|Missing or invalid field|Marketplace catalog name changed|Invalid marketplace name|Invalid plugin|Marketplace catalog not found at/i.test(rawMessage);
  if (errno === 'ENOENT' || errno === 'ENOTDIR' || /Marketplace "[^"]+" not found/i.test(rawMessage) || (!isCatalogValidationFailure && /does not exist/i.test(rawMessage))) {
    return { code: 'MARKETPLACE_SOURCE_MISSING', detail: cleaned || `Marketplace source "${fallbackTarget}" was not found.`, sourceName, sourceUri: sanitizedUri };
  }
  if (isCatalogValidationFailure) {
    return { code: 'MARKETPLACE_INVALID_SOURCE', detail: cleaned || `Marketplace source "${fallbackTarget}" has an invalid format or manifest.`, sourceName, sourceUri: sanitizedUri };
  }
  const isNetworkFailure = errno === 'ENOTFOUND' || errno === 'ECONNREFUSED' || errno === 'ECONNRESET' || errno === 'ETIMEDOUT'
    || errno === 'EAI_AGAIN' || errno === 'EHOSTUNREACH' || errno === 'ENETUNREACH'
    || /Cloned repository |Failed to fetch marketplace catalog|\bHTTP \d{3}\b|fetch failed|network|timed out|timeout|Could not resolve|Authentication failed|Permission denied|Repository not found|unable to access/i.test(rawMessage);
  if (isNetworkFailure) {
    return { code: 'MARKETPLACE_NETWORK_ERROR', detail: cleaned || `Network error while fetching marketplace source "${fallbackTarget}".`, sourceName, sourceUri: sanitizedUri };
  }
  const remoteSource = context.sourceUri !== undefined && /^(?:https?:\/\/|ssh:\/\/|git@|[a-z0-9-]+\/[a-z0-9._-]+$)/i.test(context.sourceUri.trim());
  return { code: remoteSource ? 'MARKETPLACE_NETWORK_ERROR' : 'MARKETPLACE_INVALID_SOURCE', detail: cleaned || `Marketplace operation "${context.action}" failed for "${fallbackTarget}".`, sourceName, sourceUri: sanitizedUri };
}

function marketplaceProjectionError(input: MarketplaceErrorInput): ProjectionError {
  const payload: MarketplaceErrorDetails = { action: input.action, detail: input.detail };
  if (input.sourceName) payload.sourceName = input.sourceName;
  if (input.sourceUri) payload.sourceUri = input.sourceUri;
  if (input.updatedCount !== undefined) payload.updatedCount = input.updatedCount;
  if (input.failures && input.failures.length > 0) payload.failures = input.failures;
  const details = MarketplaceErrorDetailsSchema.parse(payload);
  return new ProjectionError(marketplaceStatus(input.code), input.code, input.detail, JsonObjectSchema.parse(details));
}
/** Native package and marketplace state are instantiated per operation: their SDK managers cache mutable files. */
export class NativePlugins {
  readonly local: PluginLocalSource;
  constructor(private readonly context: NativePluginsContext) { this.local = new PluginLocalSource(context.cwd); }

  private async managers() {
    // Native SDK fallback-to-empty is not authoritative success for corrupt configuration.
    const runtime = await readNativePluginFile(getPluginsLockfile(), NativePluginConfigSchema) ?? NativePluginConfigSchema.parse({});
    const overrides = await readNativePluginFile(getProjectPluginOverridesPath(this.context.cwd), NativePluginOverridesSchema) ?? NativePluginOverridesSchema.parse({});
    await readNativePluginFile(getPluginsPackageJson(), NativePluginPackageSchema);
    const projectRegistry = await resolveOrDefaultProjectRegistryPath(this.context.cwd);
    const projectRuntime = projectRegistry === undefined ? null : await readNativePluginFile(join(dirname(projectRegistry), 'omp-plugins.lock.json'), NativePluginConfigSchema);
    return {
      runtime, overrides, projectRuntime,
      packages: new PluginManager(this.context.cwd),
      marketplace: new MarketplaceManager({
        marketplacesRegistryPath: getMarketplacesRegistryPath(),
        installedRegistryPath: getInstalledPluginsRegistryPath(),
        projectInstalledRegistryPath: projectRegistry,
        marketplacesCacheDir: getMarketplacesCacheDir(), pluginsCacheDir: getPluginsCacheDir(),
        clearPluginRootsCache: clearPluginRootsAndCaches
      }),
    };
  }

  private async publicPlugin(native: InstalledPlugin, target: PluginTarget, manager: PluginManager,
    globalConfigured: JsonObject, projectConfigured: JsonObject): Promise<InstalledPluginEntry> {
    const configured = JsonObjectSchema.parse(await manager.getPluginSettings(native.name));
    const settingDefinitions: PluginSettingDefinition[] = [];
    for (const [key, schema] of Object.entries(native.manifest.settings ?? {})) {
      const base = {
        key, description: schema.description ?? '', secret: schema.secret === true, configured: Object.hasOwn(configured, key),
        globalConfigured: Object.hasOwn(globalConfigured, key), overridden: Object.hasOwn(projectConfigured, key)
      };
      switch (schema.type) {
        case 'string': case 'boolean': settingDefinitions.push({ ...base, type: schema.type }); break;
        case 'enum': settingDefinitions.push({ ...base, type: 'enum', values: schema.values }); break;
        case 'number': settingDefinitions.push(Object.assign({ ...base, type: 'number' as const },
          schema.min === undefined ? {} : { min: schema.min }, schema.max === undefined ? {} : { max: schema.max },
          schema.step === undefined ? {} : { step: schema.step })); break;
      }
    }
    return {
      id: pluginId(target), target, name: target.name, version: native.version,
      description: native.manifest.description ?? '', scope: target.kind === 'package' || target.scope === 'user' ? 'global' : 'workspace',
      enabled: native.enabled, enabledFeatures: native.enabledFeatures, settingsScope: 'global',
      globalSettings: publicSettings(globalConfigured, settingDefinitions), settings: publicSettings(configured, settingDefinitions), settingDefinitions
    };
  }

  private async installed({ packages, marketplace, runtime, overrides, projectRuntime }: Awaited<ReturnType<NativePlugins['managers']>>) {
    const rows: { plugin: InstalledPluginEntry; native: InstalledPlugin }[] = [];
    for (const native of await packages.list()) rows.push({ native, plugin: await this.publicPlugin(native, { kind: 'package', name: native.name }, packages,
      runtime.settings?.[native.name] ?? {}, overrides.settings?.[native.name] ?? {}) });
    for (const summary of await marketplace.listInstalledPlugins()) {
      const parsed = parsePluginId(summary.id);
      if (!parsed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native marketplace plugin identity is invalid');
      const entry = summary.entries[0];
      if (!entry) continue;
      const native = await packages.getPlugin(parsed.name, { path: entry.installPath });
      if (!native) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Installed marketplace plugin metadata is unavailable');
      const target = { kind: 'marketplace' as const, ...parsed, scope: summary.scope };
      const plugin = await this.publicPlugin(native, target, packages, runtime.settings?.[native.name] ?? {}, overrides.settings?.[native.name] ?? {});
      if (summary.scope === 'project') {
        const state = projectRuntime?.plugins?.[native.name];
        plugin.enabled = entry.enabled !== false && state?.enabled !== false && !overrides.disabled?.includes(native.name);
        plugin.enabledFeatures = overrides.features?.[native.name] ?? state?.enabledFeatures ?? null;
      } else plugin.enabled = entry.enabled !== false && native.enabled;
      rows.push({ native, plugin });
    }
    return rows;
  }

  async read(revision: string): Promise<PluginCatalogState> {
    const managers = await this.managers();
    const { marketplace } = managers;
    const plugins = (await this.installed(managers)).map(row => row.plugin);
    const sources = await this.marketplaceSources(marketplace);
    return {
      workspaceId: this.context.worker.workspaceId, revision, plugins, marketplace: await this.marketplaceEntries(marketplace),
      marketplaceSources: sources, availableUpdates: await this.availableUpdates(marketplace),
      localExtensions: (await this.local.list()).map(extensionId => ({ extensionId, relativePath: `.omp/extensions/${extensionId}` })),
      workers: [], extensions: await new NativeExtensions(this.context).readInventory(),
    };
  }

  private async confinedOverridesPath(): Promise<string> {
    const cwd = resolve(this.context.cwd);
    const nativePath = getProjectPluginOverridesPath(cwd);
    const directory = dirname(nativePath);
    if (dirname(directory) !== cwd) throw new ProjectionError(403, 'UNAUTHORIZED', 'Plugin overrides must be in the workspace configuration directory');
    const root = await realpath(cwd);
    const parent = join(root, basename(directory));
    const target = join(parent, basename(nativePath));
    const parentEntry = await fileEntry(parent);
    const entry = await fileEntry(target);
    if ((parentEntry && (!parentEntry.isDirectory() || await realpath(parent) !== parent)) || (entry && !entry.isFile())) {
      throw new ProjectionError(403, 'UNAUTHORIZED', 'Plugin overrides cannot use a symbolic link or non-file target');
    }
    const registryPath = join(cwd, getConfigDirName());
    if (!parentEntry && directory.toLowerCase() === registryPath.toLowerCase()) {
      const registryDirectory = normalizePathForComparison(registryPath);
      const registry = await resolveOrDefaultProjectRegistryPath(cwd);
      if (registry !== undefined && normalizePathForComparison(dirname(dirname(registry))) !== registryDirectory
        && (await Bun.file(registry).exists() || await hasAncestorGitRoot(cwd))
        && (directory === registryPath || !await filesystemDistinguishesCase(root))) {
        throw new ProjectionError(403, 'UNAUTHORIZED', 'Creating a workspace config directory would change its OMP plugin registry root', {
          projectWriteBlock: 'registry-root-change'
        });
      }
    }
    if (!entry) {
      for (const candidate of getConfigDirPaths(basename(nativePath), { user: false, cwd })) {
        if (candidate !== nativePath && await fileEntry(candidate)) {
          throw new ProjectionError(403, 'UNAUTHORIZED', 'Native fallback plugin overrides must be migrated before editing workspace settings');
        }
      }
    }
    return target;
  }

  private async lifecycle(revision: string): Promise<PluginLifecycleState> {
    const projectCapability = await this.confinedOverridesPath().then(() => ({ projectWritable: true }), error => {
      if (error instanceof ProjectionError && error.status === 403) {
        return error.details?.projectWriteBlock === 'registry-root-change'
          ? { projectWritable: false, projectWriteBlock: 'registry-root-change' as const }
          : { projectWritable: false };
      }
      throw error;
    });
    const managers = await this.managers();
    const { overrides, runtime, projectRuntime } = managers;
    const plugins = await Promise.all((await this.installed(managers)).map(async ({ plugin, native }) => {
      const state = plugin.target.kind === 'marketplace' && plugin.target.scope === 'project' ? projectRuntime : runtime;
      return {
        ...plugin,
        availableFeatures: Object.entries(native.manifest.features ?? {}).map(([name, feature]) => ({
          name, defaultEnabled: feature.default === true, ...(feature.description === undefined ? {} : { description: feature.description })
        })),
        globalFeatures: state?.plugins?.[native.name]?.enabledFeatures ?? null,
        globalFeaturesWritable: await this.globalFeaturesWritable(plugin.target, native, runtime),
        workspaceFeatures: overrides.features?.[native.name] ?? null,
        workspaceWritable: projectCapability.projectWritable && await this.workspacePluginWritable(managers.packages, plugin.target, native),
        projectSettings: publicSettings(overrides.settings?.[native.name] ?? {}, plugin.settingDefinitions)
      };
    }));
    return { workspaceId: this.context.worker.workspaceId, revision, ...projectCapability, plugins };
  }

  private async workspacePluginWritable(packages: PluginManager, target: PluginTarget, native: InstalledPlugin): Promise<boolean> {
    const active = await packages.getPlugin(native.name);
    if (!active?.enabled) return true;
    const activeIsGlobal = normalizePathForComparison(active.path) === normalizePathForComparison(join(getPluginsNodeModules(), native.name));
    const targetIsGlobal = target.kind === 'package' || target.scope === 'user';
    return activeIsGlobal === targetIsGlobal;
  }

  private async globalFeaturesWritable(target: PluginTarget, native: InstalledPlugin, runtime: z.infer<typeof NativePluginConfigSchema>): Promise<boolean> {
    if (!Object.hasOwn(runtime.plugins ?? {}, native.name) || !NativePackageName.test(native.name)) return false;
    if (target.kind === 'package') return true;
    if (target.scope === 'project') return false;
    const runtimePath = join(getPluginsNodeModules(), native.name);
    return await fileEntry(runtimePath) !== null
      && normalizePathForComparison(await realpath(runtimePath)) === normalizePathForComparison(await realpath(native.path));
  }

  async operation(operation: NativePluginOperation, revision: string): Promise<NativePluginResult> {
    const workspaceId = this.context.worker.workspaceId;
    if (operation.type === 'plugins.owner') {
      const project = await resolveOrDefaultProjectRegistryPath(this.context.cwd);
      return {
        type: 'plugins.owner', rootPath: normalizePathForComparison(getPluginsDir()),
        localSourcePath: normalizePathForComparison(join(this.context.cwd, '.omp', 'extensions')),
        projectRegistryPath: project === undefined ? null : normalizePathForComparison(project),
        overridesPath: normalizePathForComparison(getProjectPluginOverridesPath(await realpath(this.context.cwd)))
      };
    }
    if (operation.type === 'plugins.read') return { type: 'plugins.catalog', catalog: await this.read(revision) };
    if (operation.type === 'plugins.lifecycle') return { type: 'plugins.lifecycle', result: await this.lifecycle(revision) };
    if (operation.type === 'plugins.local.read') return {
      type: 'plugins.local', result: {
        workspaceId, revision,
        extension: { extensionId: operation.extensionId, relativePath: `.omp/extensions/${operation.extensionId}` }, content: await this.local.read(operation.extensionId)
      }
    };
    if (operation.type === 'plugins.local.write') {
      await this.read(revision);
      await this.local.write(operation.request.extensionId, operation.request.content);
      return { type: 'plugins.catalog', catalog: await this.read(revision) };
    }
    if (operation.type === 'plugins.local.delete') {
      await this.read(revision);
      await this.local.delete(operation.request.extensionId);
      return { type: 'plugins.catalog', catalog: await this.read(revision) };
    }
    if (operation.type === 'plugins.apply') return {
      type: 'plugins.applied', result: {
        worker: this.context.worker,
        outcome: 'failed', appliedRevision: null, error: {
          code: 'RELOAD_REQUIRED',
          detail: 'The native SDK cannot reload extension modules in an active session. Open a new session to load committed plugins.', retryable: false
        }
      }
    };
    const { packages, marketplace, runtime } = await this.managers();
    if (operation.type === 'plugins.doctor') {
      const privateRoots = [getPluginsDir(), getConfigRootDir(), getAgentDir(), this.context.cwd, dirname(getMarketplacesRegistryPath()), getMarketplacesCacheDir(), getPluginsCacheDir()].sort((left, right) => right.length - left.length);
      const checks = (await packages.doctor()).map(check => {
        let message = check.message;
        for (const root of privateRoots) message = message.replaceAll(root, '[native plugin location]');
        return { ...check, message };
      });
      return { type: 'plugins.doctor', result: { workspaceId, revision, checks } };
    }
    if (operation.type === 'plugins.marketplace') return {
      type: 'plugins.marketplace', result: {
        workspaceId, revision, entries: await this.marketplaceEntries(marketplace),
        sources: await this.marketplaceSources(marketplace), updates: await this.availableUpdates(marketplace)
      }
    };
    if (operation.type === 'plugins.marketplace.checkUpdates') return {
      type: 'plugins.updateCheck',
      result: { workspaceId, revision, updates: await this.availableUpdates(marketplace) }
    };
    if (operation.type === 'plugins.marketplace.manage' && operation.request.action === 'list') {
      return { type: 'plugins.marketplaceSources', result: { workspaceId, revision, sources: await this.marketplaceSources(marketplace) } };
    }
    if (operation.type === 'plugins.marketplace.previewUpgrade') {
      return { type: 'plugins.upgradePreview', result: { workspaceId, revision, preview: await this.previewUpgrades(marketplace, operation.request.target) } };
    }
    if (operation.type === 'plugins.marketplace.manage') {
      await this.manageMarketplace(marketplace, operation.request);
      clearPluginRootsAndCaches();
      return { type: 'plugins.catalog', catalog: await this.read(revision) };
    }
    if (operation.type === 'plugins.marketplace.upgradeAll') {
      try { await marketplace.upgradeAllPlugins(); }
      catch (error) {
        if (error instanceof ProjectionError) throw error;
        const classified = classifyMarketplaceFailure(CaughtFailureSchema.parse(error), { action: 'upgradeAll' });
        throw marketplaceProjectionError({ code: classified.code, action: 'upgradeAll', detail: classified.detail, sourceName: classified.sourceName, sourceUri: classified.sourceUri });
      }
      clearPluginRootsAndCaches();
      return { type: 'plugins.catalog', catalog: await this.read(revision) };
    }
    try {
      if ('request' in operation && 'target' in operation.request) {
        const target = operation.request.target;
        if (target.kind === 'package' && !NativePackageName.test(target.name)) {
          throw new ProjectionError(400, 'INVALID_REQUEST', 'Native plugin package name is invalid');
        }
        if (target.kind === 'marketplace') buildPluginId(target.name, target.marketplace);
      }
      switch (operation.type) {
        case 'plugins.install': {
          const source = operation.request.source;
          if (source.kind === 'package') await packages.install(source.spec);
          else await marketplace.installPlugin(source.name, source.marketplace, { scope: source.scope });
          break;
        }
        case 'plugins.uninstall': {
          const target = operation.request.target;
          if (target.kind === 'package') await packages.uninstall(target.name);
          else await marketplace.uninstallPlugin(buildPluginId(target.name, target.marketplace), target.scope);
          break;
        }
        case 'plugins.update': {
          const target = operation.request.target;
          if (target.kind === 'package') await packages.upgrade(target.name);
          else await marketplace.upgradePlugin(buildPluginId(target.name, target.marketplace), target.scope);
          break;
        }
        case 'plugins.configure': {
          const { target, enabled, settings, enabledFeatures, settingsScope } = operation.request;
          const workspace = settingsScope === 'workspace';
          const overridePath = workspace && (settings !== undefined || enabledFeatures !== undefined)
            ? await this.confinedOverridesPath() : null;
          let native: InstalledPlugin | undefined;
          if (target.kind === 'package') {
            native = overridePath !== null || enabledFeatures !== undefined
              ? (await packages.list()).find(plugin => plugin.name === target.name)
              : await packages.getPlugin(target.name, { path: join(getPluginsNodeModules(), target.name) });
          }
          else {
            const summary = (await marketplace.listInstalledPlugins()).find(item => item.id === buildPluginId(target.name, target.marketplace) && item.scope === target.scope);
            const entry = summary?.entries[0];
            if (entry) native = await packages.getPlugin(target.name, { path: entry.installPath });
          }
          if (!native) throw new ProjectionError(404, 'INVALID_REQUEST', 'Plugin is not installed');
          if (enabledFeatures !== undefined) {
            if (!workspace && !await this.globalFeaturesWritable(target, native, runtime)) {
              throw new ProjectionError(400, 'INVALID_REQUEST', 'The selected plugin has no matching native global feature record');
            }
            if (enabledFeatures?.some(name => !Object.hasOwn(native.manifest.features ?? {}, name))) {
              throw new ProjectionError(400, 'INVALID_REQUEST', 'Plugin feature is not declared by the installed plugin');
            }
          }
          for (const [key, value] of Object.entries(settings ?? {})) {
            const schema = native.manifest.settings?.[key];
            if (!native.manifest.settings || !Object.hasOwn(native.manifest.settings, key) || !schema || !validateSetting(value, schema).valid) {
              throw new ProjectionError(400, 'INVALID_REQUEST', 'Plugin setting does not match its native definition');
            }
            if (workspace && schema.secret) throw new ProjectionError(400, 'INVALID_REQUEST', 'Secret settings cannot be written to a workspace');
          }
          const paths = new Set<string>();
          if ((!workspace && (settings !== undefined || enabledFeatures !== undefined)) || (enabled !== undefined && target.kind === 'package')) {
            paths.add(getPluginsLockfile());
          }
          if (enabled !== undefined && target.kind === 'marketplace') {
            if (target.scope === 'user') {
              paths.add(getInstalledPluginsRegistryPath());
              paths.add(getPluginsLockfile());
            } else {
              const registry = await resolveOrDefaultProjectRegistryPath(this.context.cwd);
              if (registry !== undefined) {
                paths.add(registry);
                paths.add(join(dirname(registry), 'omp-plugins.lock.json'));
              }
            }
          }
          const previousOverrides = overridePath !== null && await fileEntry(overridePath) ? await readFile(overridePath, 'utf8') : null;
          const snapshots = new Map<string, string | null>();
          for (const path of paths) {
            try { snapshots.set(path, await readFile(path, 'utf8')); }
            catch (error) {
              if (error instanceof Error && 'code' in error && error.code === 'ENOENT') snapshots.set(path, null);
              else throw error;
            }
          }
          try {
            if (settings !== undefined && !workspace) {
              for (const [key, definition] of Object.entries(native.manifest.settings ?? {})) {
                if (definition.secret !== true && !Object.hasOwn(settings, key)) await packages.deletePluginSetting(native.name, key);
              }
              for (const [key, value] of Object.entries(settings)) await packages.setPluginSetting(native.name, key, value);
            }
            if (enabledFeatures !== undefined && !workspace) await packages.setEnabledFeatures(native.name, enabledFeatures);
            if (enabled !== undefined) {
              if (target.kind === 'package') await packages.setEnabled(native.name, enabled);
              else await marketplace.setPluginEnabled(buildPluginId(target.name, target.marketplace), enabled, target.scope);
            }
            if (overridePath !== null) {
              const workspacePackages = enabled === undefined ? packages : new PluginManager(this.context.cwd);
              if (!await this.workspacePluginWritable(workspacePackages, target, native)) {
                throw new ProjectionError(400, 'INVALID_REQUEST', 'Workspace overrides must target the active copy of the plugin');
              }
              const overrides = NativePluginOverridesSchema.parse(previousOverrides === null ? {} : JSON.parse(previousOverrides));
              if (settings !== undefined) {
                const values = { ...overrides.settings?.[native.name] };
                for (const [key, definition] of Object.entries(native.manifest.settings ?? {})) {
                  if (!definition.secret) delete values[key];
                }
                const next = { ...overrides.settings, [native.name]: { ...values, ...settings } };
                if (Object.keys(next[native.name]!).length === 0) delete next[native.name];
                overrides.settings = next;
              }
              if (enabledFeatures !== undefined) {
                const next = { ...overrides.features };
                if (enabledFeatures === null) delete next[native.name];
                else Object.defineProperty(next, native.name, { value: enabledFeatures, enumerable: true, configurable: true });
                overrides.features = next;
              }
              await this.atomicOverrides(overridePath, JSON.stringify(overrides, null, 2));
              snapshots.set(overridePath, previousOverrides);
            }
            clearPluginRootsAndCaches();
            return { type: 'plugins.catalog', catalog: await this.read(revision) };
          } catch (error) {
            let rollbackFailed = false;
            for (const [path, source] of snapshots) {
              try {
                if (path === overridePath && await this.confinedOverridesPath() !== path) throw new Error('Workspace changed');
                if (source !== null) await this.atomicConfiguration(path, source, path === overridePath);
                else try { await unlink(path); } catch (failure) { if (!(failure instanceof Error && 'code' in failure && failure.code === 'ENOENT')) throw failure; }
              } catch { rollbackFailed = true; }
            }
            clearPluginRootsAndCaches();
            if (rollbackFailed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native plugin configuration rollback could not restore every prior file');
            throw error;
          }
        }
      }
    } catch (error) {
      if (error instanceof ProjectionError) throw error;
      throw new ProjectionError(400, 'INVALID_REQUEST', 'Native plugin operation failed. Check the plugin identity, source and diagnostics.');
    }
    clearPluginRootsAndCaches();
    return { type: 'plugins.catalog', catalog: await this.read(revision) };
  }
  private async manageMarketplace(marketplace: MarketplaceManager, request: Extract<NativePluginOperation, { type: 'plugins.marketplace.manage' }>['request']): Promise<void> {
    if (request.action === 'list') throw new ProjectionError(400, 'INVALID_REQUEST', 'Marketplace listing is a cached read');
    if (request.action === 'add') {
      const trimmed = request.source.trim();
      const sanitizedUri = sanitizeMarketplaceText(trimmed);
      let sourceType: MarketplaceSource['sourceType'];
      try { sourceType = classifySource(trimmed); }
      catch (error) {
        const classified = classifyMarketplaceFailure(CaughtFailureSchema.parse(error), { action: 'add', sourceUri: trimmed });
        throw marketplaceProjectionError({ code: classified.code, action: 'add', detail: classified.detail, sourceName: classified.sourceName, sourceUri: sanitizedUri });
      }
      if (sourceType === 'local' && await fileEntry(resolve(expandTildePath(trimmed)), stat) === null) {
        throw marketplaceProjectionError({ code: 'MARKETPLACE_SOURCE_MISSING', action: 'add', sourceUri: sanitizedUri, detail: `Local marketplace path "${sanitizedUri}" does not exist.` });
      }
      try { await marketplace.addMarketplace(trimmed); }
      catch (error) {
        if (error instanceof ProjectionError) throw error;
        const classified = classifyMarketplaceFailure(CaughtFailureSchema.parse(error), { action: 'add', sourceUri: trimmed });
        throw marketplaceProjectionError({ code: classified.code, action: 'add', detail: classified.detail, sourceName: classified.sourceName, sourceUri: classified.sourceUri ?? sanitizedUri });
      }
      return;
    }
    if (request.action === 'remove') {
      const registered = await marketplace.listMarketplaces();
      if (!registered.some(source => source.name === request.name)) return;
      try { await marketplace.removeMarketplace(request.name); }
      catch (primaryError) {
        try {
          const registryPath = getMarketplacesRegistryPath();
          const registry = await readMarketplacesRegistry(registryPath);
          if (registry.marketplaces.some(entry => entry.name === request.name)) {
            await mkdir(dirname(registryPath), { recursive: true, mode: 0o700 });
            await writeMarketplacesRegistry(registryPath, { ...registry, marketplaces: registry.marketplaces.filter(entry => entry.name !== request.name) });
          }
          if (!request.name.includes('/') && !request.name.includes('\\') && request.name !== '.' && request.name !== '..') {
            await rm(join(getMarketplacesCacheDir(), request.name), { recursive: true, force: true }).catch(() => {});
          }
        } catch (fallbackError) {
          const classified = classifyMarketplaceFailure(CaughtFailureSchema.parse(fallbackError ?? primaryError), { action: 'remove', sourceName: request.name });
          throw marketplaceProjectionError({ code: classified.code, action: 'remove', detail: classified.detail, sourceName: request.name });
        }
      }
      return;
    }
    const sources = await marketplace.listMarketplaces();
    if (request.name !== undefined) {
      const target = sources.find(source => source.name === request.name);
      if (!target) throw marketplaceProjectionError({ code: 'MARKETPLACE_SOURCE_MISSING', action: 'update', sourceName: request.name, detail: `Marketplace "${request.name}" is not registered.` });
      const sanitizedUri = sanitizeMarketplaceText(target.sourceUri);
      if (target.sourceType === 'local' && await fileEntry(resolve(expandTildePath(target.sourceUri)), stat) === null) {
        throw marketplaceProjectionError({ code: 'MARKETPLACE_SOURCE_MISSING', action: 'update', sourceName: target.name, sourceUri: sanitizedUri, detail: `Local marketplace path "${sanitizedUri}" for "${target.name}" does not exist.` });
      }
      try { await marketplace.updateMarketplace(target.name); }
      catch (error) {
        if (error instanceof ProjectionError) throw error;
        const classified = classifyMarketplaceFailure(CaughtFailureSchema.parse(error), { action: 'update', sourceName: target.name, sourceUri: target.sourceUri });
        throw marketplaceProjectionError({ code: classified.code, action: 'update', detail: classified.detail, sourceName: classified.sourceName ?? target.name, sourceUri: classified.sourceUri ?? sanitizedUri });
      }
      return;
    }
    let updatedCount = 0;
    const failures: MarketplaceSourceFailure[] = [];
    for (const src of sources) {
      const sanitizedUri = sanitizeMarketplaceText(src.sourceUri);
      if (src.sourceType === 'local' && await fileEntry(resolve(expandTildePath(src.sourceUri)), stat) === null) {
        const failure: MarketplaceSourceFailure = { name: src.name, code: 'MARKETPLACE_SOURCE_MISSING', detail: `Local marketplace path "${sanitizedUri}" does not exist.` };
        if (sanitizedUri) failure.sourceUri = sanitizedUri;
        failures.push(failure);
        continue;
      }
      try {
        await marketplace.updateMarketplace(src.name);
        updatedCount += 1;
      } catch (error) {
        const classified = classifyMarketplaceFailure(CaughtFailureSchema.parse(error), { action: 'update', sourceName: src.name, sourceUri: src.sourceUri });
        const failure: MarketplaceSourceFailure = { name: src.name, code: classified.code, detail: classified.detail };
        if (sanitizedUri) failure.sourceUri = sanitizedUri;
        failures.push(failure);
      }
    }
    if (updatedCount > 0) clearPluginRootsAndCaches();
    if (failures.length > 0) {
      const primaryCode: MarketplaceErrorCode = failures.length === 1
        ? failures[0]!.code
        : failures.some(failure => failure.code === 'MARKETPLACE_SOURCE_MISSING')
          ? 'MARKETPLACE_SOURCE_MISSING'
          : failures.some(failure => failure.code === 'MARKETPLACE_NETWORK_ERROR')
            ? 'MARKETPLACE_NETWORK_ERROR'
            : failures[0]!.code;
      const summary = failures.length === 1
        ? (updatedCount > 0 ? `Updated ${updatedCount} marketplace source(s); failed for "${failures[0]!.name}": ${failures[0]!.detail}` : `Marketplace "${failures[0]!.name}" refresh failed: ${failures[0]!.detail}`)
        : `${updatedCount > 0 ? `Updated ${updatedCount} marketplace source(s); f` : 'F'}ailed for ${failures.length} sources: ${failures.map(failure => `${failure.name} (${failure.detail})`).join('; ')}`;
      const errorInput: MarketplaceErrorInput = { code: primaryCode, action: 'update', detail: summary, updatedCount, failures };
      if (failures.length === 1) {
        errorInput.sourceName = failures[0]!.name;
        if (failures[0]!.sourceUri) errorInput.sourceUri = failures[0]!.sourceUri;
      }
      throw marketplaceProjectionError(errorInput);
    }
  }
  private async marketplaceEntries(manager: MarketplaceManager): Promise<MarketplaceEntry[]> {
    const entries: MarketplaceEntry[] = [];
    for (const registry of await manager.listMarketplaces()) {
      try {
        for (const entry of await manager.listAvailablePlugins(registry.name)) {
          entries.push({
            marketplace: registry.name, name: entry.name, description: entry.description ?? '', version: entry.version ?? null,
            ...marketplaceDetails(entry),
          });
        }
      } catch {
        continue;
      }
    }
    return entries;
  }
  /** Registry entries are the configured catalog sources; reading them never fetches. */
  private async marketplaceSources(manager: MarketplaceManager): Promise<MarketplaceSource[]> {
    return (await manager.listMarketplaces()).map(source => ({
      name: source.name, sourceType: source.sourceType, sourceUri: source.sourceUri,
      catalogPath: source.catalogPath, addedAt: source.addedAt, updatedAt: source.updatedAt
    }));
  }
  /** Cached-registry update check; the native manager compares installed versions to catalog versions. */
  private async availableUpdates(manager: MarketplaceManager): Promise<PluginUpdateCheckEntry[]> {
    const updates: PluginUpdateCheckEntry[] = [];
    for (const update of await manager.checkForUpdates()) {
      const parsed = parsePluginId(update.pluginId);
      if (!parsed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native marketplace plugin identity is invalid');
      updates.push({
        pluginId: update.pluginId, scope: update.scope === 'user' ? 'global' : 'workspace',
        target: { kind: 'marketplace', name: parsed.name, marketplace: parsed.marketplace, scope: update.scope },
        from: update.from, to: update.to
      });
    }
    return updates;
  }
  /** Native preview validates the real upgrade, so a rejected plugin is a failure, not an empty preview. */
  private async previewUpgrades(manager: MarketplaceManager, target: PluginTarget | undefined): Promise<PluginUpgradePreviewEntry[]> {
    const rows: PluginUpgradePreviewEntry[] = [];
    if (target !== undefined) {
      if (target.kind !== 'marketplace') throw new ProjectionError(400, 'INVALID_REQUEST', 'Native marketplace previews require a marketplace plugin target');
      const pluginId = buildPluginId(target.name, target.marketplace);
      for (const row of await manager.previewUpgradePlugin(pluginId, target.scope)) {
        rows.push({
          pluginId, scope: row.scope === 'user' ? 'global' : 'workspace',
          target: { kind: 'marketplace', name: target.name, marketplace: target.marketplace, scope: row.scope },
          from: row.from ?? null, to: row.to ?? null, change: row.change ?? null
        });
      }
      return rows;
    }
    for (const row of await manager.previewUpgradeAllPlugins()) {
      const parsed = parsePluginId(row.pluginId);
      if (!parsed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native marketplace plugin identity is invalid');
      rows.push({
        pluginId: row.pluginId, scope: row.scope === 'user' ? 'global' : 'workspace',
        target: { kind: 'marketplace', name: parsed.name, marketplace: parsed.marketplace, scope: row.scope },
        from: row.from, to: row.to, change: 'upgrade'
      });
    }
    return rows;
  }

  private async atomicOverrides(path: string, source: string): Promise<void> {
    if (await this.confinedOverridesPath() !== path) throw new ProjectionError(403, 'UNAUTHORIZED', 'Workspace changed before plugin settings could be saved');
    await this.atomicConfiguration(path, source, true);
  }

  private async atomicConfiguration(path: string, source: string, workspace = false): Promise<void> {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, source, { flag: 'wx', mode: 0o600 });
      if (workspace && await this.confinedOverridesPath() !== path) throw new ProjectionError(403, 'UNAUTHORIZED', 'Workspace changed before plugin settings could be saved');
      await rename(temporary, path);
    } finally { await removeTemporaryFile(temporary); }
  }
}
