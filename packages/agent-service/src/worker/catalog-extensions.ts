import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, sep } from 'node:path';
import type { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';
import { cfgDisabledProviders, cfgEnabledProviders } from '@oh-my-pi/pi-coding-agent/config/model-settings';
import { cfgDisabledExtensions } from '@oh-my-pi/pi-coding-agent/extensibility/settings';
import type { Capability, EffectiveExtensionRoots } from '@oh-my-pi/pi-coding-agent/capability/types';
import {
 getAllProvidersInfo, initializeWithSettings, isForeignUserProvider, isProviderEnabled, isUserSourceEnabled, loadCapability,
} from '@oh-my-pi/pi-coding-agent/discovery';
import { skillCapability } from '@oh-my-pi/pi-coding-agent/capability/skill';
import { ruleCapability } from '@oh-my-pi/pi-coding-agent/capability/rule';
import { hookCapability } from '@oh-my-pi/pi-coding-agent/capability/hook';
import { contextFileCapability } from '@oh-my-pi/pi-coding-agent/capability/context-file';
import { toolCapability } from '@oh-my-pi/pi-coding-agent/capability/tool';
import { extensionModuleCapability } from '@oh-my-pi/pi-coding-agent/capability/extension-module';
import { promptCapability } from '@oh-my-pi/pi-coding-agent/capability/prompt';
import { slashCommandCapability } from '@oh-my-pi/pi-coding-agent/capability/slash-command';
import { mcpCapability } from '@oh-my-pi/pi-coding-agent/capability/mcp';
import { instructionCapability } from '@oh-my-pi/pi-coding-agent/capability/instruction';
import { sshCapability } from '@oh-my-pi/pi-coding-agent/capability/ssh';
import type {
 CatalogWorkerIdentity, ExtensionDisabledReason, ExtensionInventory, ExtensionItem, ExtensionItemMetadata,
 ExtensionKind, ExtensionProviderEntry, ExtensionToggleRequest,
} from '@openchamber/agent-contract';
import { ExtensionInventorySchema } from '@openchamber/agent-contract';
import { ProjectionError } from '../projection/journal.ts';
import type { NativeExtensionOperation, NativeExtensionResult } from '../catalogs/plugins.ts';

/** The worker-owned native settings and discovery roots this projection reads and writes. */
export interface NativeExtensionsContext {
 cwd: string;
 agentDirectory: string;
 worker: CatalogWorkerIdentity;
 settings: Settings;
 /** Current native extension roots; read at each projection so a session re-root is observed. */
 extensionRoots: EffectiveExtensionRoots;
}

interface ProjectedSource {
 provider: string;
 providerName: string;
 path: string;
 level: 'user' | 'project' | 'native';
 origin?: string;
 pluginName?: string;
}

interface DiscoveredItem {
 _source: ProjectedSource;
 _shadowed?: boolean;
 name?: string;
 path?: string;
}

/** Inventory plus the private row-to-`disabledExtensions` map item toggles resolve through. */
interface ExtensionInventoryProjection {
 inventory: ExtensionInventory;
 nativeIds: Map<string, string>;
}

type DisplayRoots = ReadonlyArray<readonly [string, string]>;

/** Largest roots first, so a nested agent directory never loses to its home parent. */
function displayPath(target: string, roots: DisplayRoots): string {
 for (const [root, label] of roots) {
  if (target === root) return label;
  if (target.startsWith(`${root}${sep}`)) return `${label}/${target.slice(root.length + 1).split(sep).join('/')}`;
 }
 const parts = target.split(sep).filter(Boolean);
 return parts.length <= 2 ? `…/${parts.join('/')}` : `…/${parts.slice(-2).join('/')}`;
}

function sanitizeText(text: string, roots: DisplayRoots): string {
 let sanitized = text;
 for (const [root, label] of roots) sanitized = sanitized.split(root).join(label);
 return sanitized;
}

/**
 * Native discovery warnings carry file paths. Keep only those whose paths are
 * already accounted for by a display root; an uncensorable warning is dropped
 * rather than published with a private absolute path.
 */
function safeWarning(text: string, roots: DisplayRoots): string | undefined {
 const sanitized = sanitizeText(text, roots);
 return sanitized.split(/\s+/).some(token => token.startsWith('/') || /^[A-Za-z]:\\/.test(token)) ? undefined : sanitized;
}

function itemIdentityBase(kind: ExtensionKind, nativeId: string | undefined, key: string | undefined, name: string, source: ProjectedSource, itemPath: string): string {
 return `ext_${createHash('sha256').update(JSON.stringify([kind, nativeId, key, name, source.provider, source.level, source.origin, source.pluginName, source.path, itemPath])).digest('hex').slice(0, 24)}`;
}

/** Only the scheme hostname survives; credentials, paths and query strings never reach the wire. */
function urlHost(url: string | undefined): string | undefined {
 if (url === undefined) return undefined;
 try {
  return new URL(url).hostname || undefined;
 } catch {
  return undefined;
 }
}

/** Native `disabledExtensions` gating, mirroring the native dashboard's own precedence. */
function disabledReason(
 source: ProjectedSource,
 nativeDisabled: boolean,
 shadowed: boolean,
 userSources: (source: string) => boolean,
 providerEnabled: (source: string) => boolean,
): ExtensionDisabledReason | undefined {
 if (shadowed) return undefined;
 if (nativeDisabled) return 'item-disabled';
 if (!providerEnabled(source.provider)) return 'provider-disabled';
 // omp-native marketplace roots under ~/.omp/plugins are not the foreign tree.
 if (source.provider === 'claude-plugins' && source.origin !== undefined && source.origin !== 'claude') return undefined;
 if (source.level === 'user' && !userSources(source.provider)) return 'user-opt-in';
 return undefined;
}

/**
 * Native Capability Registry and Extension Control Center projection.
 *
 * Reads run under {@link initializeWithSettings} so provider switches and item
 * `disabledExtensions` come from the same persisted settings authority the SDK
 * uses. Toggles write those native settings through the owning instance and
 * report failures instead of claiming success.
 */
export class NativeExtensions {
 constructor(private readonly context: NativeExtensionsContext) { }

 private roots(): DisplayRoots {
  return ([
   [this.context.agentDirectory, '<agent>'], [this.context.cwd, '<workspace>'], [homedir(), '~'],
  ] as const).filter(([root]) => root.length > 0).sort((left, right) => right[0].length - left[0].length);
 }

 /** Every registered provider, including providers that discovered nothing. */
 private providers(counts: ReadonlyMap<string, number>): ExtensionProviderEntry[] {
  return getAllProvidersInfo().map(provider => ({
   id: provider.id, displayName: provider.displayName, description: provider.description,
   priority: provider.priority, capabilities: provider.capabilities, enabled: provider.enabled,
   userSourceEnabled: isUserSourceEnabled(provider.id),
   foreignUserSource: isForeignUserProvider(provider.id),
   itemCount: counts.get(provider.id) ?? 0,
  }));
 }

 /**
  * Project every requested capability from the native registry. Disabled,
  * shadowed and zero-item rows are retained so the inspector can explain them.
  */
 private async collect(): Promise<ExtensionInventoryProjection> {
  await this.context.settings.reloadFromDisk();
  const roots = this.roots();
  const nativeIds = new Map<string, string>();
  const occurrences = new Map<string, number>();
  const disabledExtensions = new Set(cfgDisabledExtensions.get(this.context.settings));
  const warnings: string[] = [];
  const rows: ExtensionItem[] = [];
  const winners = new Map<string, string>();

  const addCapability = async <T extends DiscoveredItem>(
   kind: ExtensionKind,
   capability: Capability<T>,
   extra: (item: T) => Partial<ExtensionItem>,
  ): Promise<void> => {
   const result = await loadCapability<T>(capability.id, {
    cwd: this.context.cwd, agentDir: this.context.agentDirectory,
    includeDisabled: true, disabledExtensions: [...disabledExtensions], extensionRoots: this.context.extensionRoots,
   });
   for (const warning of result.warnings) {
    const safe = safeWarning(warning, roots);
    if (safe !== undefined) warnings.push(safe);
   }
   for (const item of result.all) {
    const source: ProjectedSource = item._source;
    const itemPath = item.path ?? source.path;
    const name = item.name ?? basename(itemPath);
    const nativeId = capability.toExtensionId?.(item);
    const key = capability.key(item);
    const base = itemIdentityBase(kind, nativeId, key, name, source, itemPath);
    const occurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occurrence);
    const shadowed = Boolean(item._shadowed);
    const nativeDisabled = nativeId !== undefined && disabledExtensions.has(nativeId);
    const reason = disabledReason(source, nativeDisabled, shadowed, isUserSourceEnabled, isProviderEnabled);
    const row: ExtensionItem = {
     id: occurrence === 1 ? base : `${base}_${occurrence}`,
     kind, name, providerId: source.provider, providerName: source.providerName,
     scope: source.level === 'native' ? 'builtin' : source.level,
     path: displayPath(itemPath, roots),
     enabled: !shadowed && reason === undefined,
     shadowed, toggleable: nativeId !== undefined, triggers: [], ...extra(item),
    };
    if (reason !== undefined) row.disabledReason = reason;
    if (shadowed && key !== undefined) {
     const winner = winners.get(`${capability.id}\0${key}`);
     if (winner !== undefined) row.shadowedBy = winner;
    }
    if (nativeId !== undefined) nativeIds.set(row.id, nativeId);
    if (!shadowed && key !== undefined && row.shadowedBy === undefined) {
     winners.set(`${capability.id}\0${key}`, `${source.providerName} · ${row.path}`);
    }
    rows.push(row);
   }
  };

  await addCapability('skill', skillCapability, skill => ({
   description: typeof skill.frontmatter?.description === 'string' ? sanitizeText(skill.frontmatter.description, roots) : undefined,
   triggers: skill.frontmatter?.globs ?? [], content: sanitizeText(skill.content, roots),
  }));

  await addCapability('rule', ruleCapability, rule => ({
   description: rule.description === undefined ? undefined : sanitizeText(rule.description, roots),
   triggers: [...(rule.globs ?? []), ...(rule.condition ?? []), ...(rule.astCondition ?? []), ...(rule.alwaysApply ? ['always'] : [])],
   content: sanitizeText(rule.content, roots),
  }));

  await addCapability('hook', hookCapability, hook => ({
   description: `${hook.type}-${hook.tool}`, triggers: [`${hook.type}:${hook.tool}`],
  }));

  await addCapability('context-file', contextFileCapability, file => ({
   content: sanitizeText(file.content, roots),
  }));

  await addCapability('tool', toolCapability, tool => ({
   description: tool.description === undefined ? undefined : sanitizeText(tool.description, roots),
  }));

  await addCapability('extension-module', extensionModuleCapability, () => ({}));

  await addCapability('prompt', promptCapability, prompt => ({
   triggers: [`/prompts:${prompt.name}`], content: sanitizeText(prompt.content, roots),
  }));

  await addCapability('slash-command', slashCommandCapability, command => ({
   description: command.description === undefined ? undefined : sanitizeText(command.description, roots),
   triggers: [`/${command.name}`], content: sanitizeText(command.content, roots),
  }));

  await addCapability('mcp', mcpCapability, server => {
   const transport = server.transport ?? (server.command ? 'stdio' : server.url ? 'http' : 'stdio');
   const metadata: ExtensionItemMetadata = { transport: transport === 'sse' || transport === 'http' ? transport : 'stdio' };
   const host = urlHost(server.url);
   if (host !== undefined) metadata.host = host;
   return { description: `${transport} server`, triggers: [transport], metadata };
  });

  await addCapability('instruction', instructionCapability, instruction => ({
   triggers: instruction.applyTo === undefined ? [] : [instruction.applyTo],
   content: sanitizeText(instruction.content, roots),
  }));

  await addCapability('ssh', sshCapability, host => {
   const metadata: ExtensionItemMetadata = { host: host.host };
   if (host.username !== undefined) metadata.username = host.username;
   if (host.port !== undefined) metadata.port = host.port;
   return {
    description: host.description === undefined ? undefined : sanitizeText(host.description, roots),
    triggers: [host.host], metadata,
   };
  });

  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.providerId, (counts.get(row.providerId) ?? 0) + 1);
  return {
   inventory: ExtensionInventorySchema.parse({
    providers: this.providers(counts), items: rows,
    warnings: warnings.slice(0, 20),
    kinds: [
     { kind: 'skill', label: skillCapability.displayName },
     { kind: 'rule', label: ruleCapability.displayName },
     { kind: 'hook', label: hookCapability.displayName },
     { kind: 'context-file', label: contextFileCapability.displayName },
     { kind: 'tool', label: toolCapability.displayName },
     { kind: 'extension-module', label: extensionModuleCapability.displayName },
     { kind: 'prompt', label: promptCapability.displayName },
     { kind: 'slash-command', label: slashCommandCapability.displayName },
     { kind: 'mcp', label: mcpCapability.displayName },
     { kind: 'instruction', label: instructionCapability.displayName },
     { kind: 'ssh', label: sshCapability.displayName },
    ],
   }),
   nativeIds,
  };
 }

 /** Read the inventory; the state owns the workspace and its catalog revision. */
 async read(revision: string): Promise<NativeExtensionResult> {
  return {
   type: 'extensions.inventory',
   state: { workspaceId: this.context.worker.workspaceId, revision, extensions: await this.readInventory() },
  };
 }

 /** Inventory without an envelope, for catalogs that embed it. */
 async readInventory(): Promise<ExtensionInventory> {
  const release = initializeWithSettings(this.context.settings);
  try {
   return (await this.collect()).inventory;
  } finally { release(); }
 }

 /**
  * Persist one native switch. A provider request edits `disabledProviders`; a
  * `userSource` request edits only `enabledProviders`, so opting out of a
  * foreign user-level tree leaves project configuration alone. Item requests
  * edit `disabledExtensions`.
  */
 async toggle(request: ExtensionToggleRequest, revision: string): Promise<NativeExtensionResult> {
  const release = initializeWithSettings(this.context.settings);
  try {
   const { inventory, nativeIds } = await this.collect();
   const provider = inventory.providers.find(candidate => candidate.id === request.providerId);
   if (provider === undefined) throw new ProjectionError(404, 'INVALID_REQUEST', 'The discovery provider is not registered');
   if (request.extensionId === undefined && request.userSource === true) {
    cfgEnabledProviders.set(this.context.settings, withMember(
     cfgEnabledProviders.get(this.context.settings), provider.id, request.enabled));
   } else if (request.extensionId === undefined) {
    cfgDisabledProviders.set(this.context.settings, withMember(
     cfgDisabledProviders.get(this.context.settings), provider.id, !request.enabled));
   } else {
    const row = inventory.items.find(candidate => candidate.id === request.extensionId);
    if (row === undefined || row.providerId !== provider.id) {
     throw new ProjectionError(404, 'INVALID_REQUEST', 'The extension row does not belong to the selected provider');
    }
    if (row.shadowed) {
     throw new ProjectionError(409, 'INVALID_REQUEST', 'Shadowed extension items cannot be toggled');
    }
    if (!row.toggleable) throw new ProjectionError(422, 'UNSUPPORTED_CAPABILITY', 'This extension kind has no native per-item switch');
    const nativeId = nativeIds.get(row.id);
    if (nativeId === undefined) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'The extension row identity is unavailable');
    cfgDisabledExtensions.set(this.context.settings, withMember(
     cfgDisabledExtensions.get(this.context.settings), nativeId, !request.enabled));
   }
   try { await this.context.settings.flush(); }
   catch {
    await this.context.settings.reloadFromDisk().catch(() => undefined);
    throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native extension settings could not be persisted');
   }
   await this.context.settings.reloadFromDisk();
   const { inventory: refreshed } = await this.collect();
   return {
    type: 'extensions.inventory',
    state: { workspaceId: this.context.worker.workspaceId, revision, extensions: refreshed },
   };
  } finally { release(); }
 }

 async operation(operation: NativeExtensionOperation, revision: string): Promise<NativeExtensionResult> {
  if (operation.type === 'extensions.read') return this.read(revision);
  return this.toggle(operation.request, revision);
 }
}

/** Membership edit that preserves the native list order for untouched ids. */
function withMember(current: readonly string[], member: string, present: boolean): string[] {
 const without = current.filter(value => value !== member);
 return present ? [...without, member] : without;
}
