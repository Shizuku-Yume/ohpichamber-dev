import { z } from 'zod';
import { CounterSchema, EntityIdSchema, JsonObjectSchema, JsonValueSchema } from './primitives.ts';
import { CatalogOperationErrorSchema, CatalogWorkerIdentitySchema } from './catalogs.ts';

export const PluginScopeSchema = z.enum(['global', 'workspace']);
export type PluginScope = z.infer<typeof PluginScopeSchema>;
export const PluginTargetSchema = z.discriminatedUnion('kind', [
 z.strictObject({ kind: z.literal('package'), name: z.string().min(1) }),
 z.strictObject({ kind: z.literal('marketplace'), name: z.string().min(1), marketplace: z.string().min(1), scope: z.enum(['user', 'project']) }),
]);
export type PluginTarget = z.infer<typeof PluginTargetSchema>;
const SettingBase = {
 key: z.string().min(1), description: z.string(), secret: z.boolean(),
 configured: z.boolean(), globalConfigured: z.boolean(), overridden: z.boolean(),
};
export const PluginSettingDefinitionSchema = z.discriminatedUnion('type', [
 z.strictObject({ ...SettingBase, type: z.literal('string') }),
 z.strictObject({ ...SettingBase, type: z.literal('number'), min: z.number().optional(), max: z.number().optional(), step: z.number().optional() }),
 z.strictObject({ ...SettingBase, type: z.literal('boolean') }),
 z.strictObject({ ...SettingBase, type: z.literal('enum'), values: z.array(z.string()) }),
]);
export type PluginSettingDefinition = z.infer<typeof PluginSettingDefinitionSchema>;
export const InstalledPluginEntrySchema = z.strictObject({
 id: EntityIdSchema, target: PluginTargetSchema, name: z.string().min(1), version: z.string(),
 description: z.string(), scope: PluginScopeSchema, enabled: z.boolean(),
 enabledFeatures: z.array(z.string()).nullable(),
 settingsScope: z.literal('global'), globalSettings: JsonObjectSchema,
 settings: JsonObjectSchema, settingDefinitions: z.array(PluginSettingDefinitionSchema),
}).superRefine((plugin, context) => {
 const expectedScope = plugin.target.kind === 'package' || plugin.target.scope === 'user' ? 'global' : 'workspace';
 if (plugin.scope !== expectedScope || plugin.name !== plugin.target.name) {
  context.addIssue({ code: 'custom', message: 'Plugin identity and scope match their native target' });
 }
 if (new Set(plugin.settingDefinitions.map(setting => setting.key)).size !== plugin.settingDefinitions.length) {
  context.addIssue({ code: 'custom', message: 'Plugin setting definitions are unique' });
 }
 for (const setting of plugin.settingDefinitions) {
  if (setting.secret && (Object.hasOwn(plugin.settings, setting.key) || Object.hasOwn(plugin.globalSettings, setting.key))) {
   context.addIssue({ code: 'custom', path: ['settings', setting.key], message: 'Secret plugin settings are never public' });
  }
 }
 for (const key of [...Object.keys(plugin.settings), ...Object.keys(plugin.globalSettings)]) {
  if (!plugin.settingDefinitions.some(setting => setting.key === key)) {
   context.addIssue({ code: 'custom', path: ['settings', key], message: 'Only declared native plugin settings are public' });
  }
 }
});
export type InstalledPluginEntry = z.infer<typeof InstalledPluginEntrySchema>;
const PluginLifecycleEntrySchema = InstalledPluginEntrySchema.safeExtend({
 availableFeatures: z.array(z.strictObject({ name: z.string(), description: z.string().optional(), defaultEnabled: z.boolean() })),
 globalFeatures: z.array(z.string()).nullable(),
 globalFeaturesWritable: z.boolean(),
 workspaceFeatures: z.array(z.string()).nullable(),
 workspaceWritable: z.boolean(),
 projectSettings: JsonObjectSchema,
}).refine(plugin => Object.keys(plugin.projectSettings).every(key =>
 plugin.settingDefinitions.some(setting => setting.key === key && !setting.secret)),
 'Only declared nonsecret project settings are public');
export const PluginLifecycleStateSchema = z.strictObject({
 workspaceId: EntityIdSchema, revision: CounterSchema, projectWritable: z.boolean(),
 projectWriteBlock: z.literal('registry-root-change').optional(),
 plugins: z.array(PluginLifecycleEntrySchema),
}).refine(state => new Set(state.plugins.map(plugin => plugin.id)).size === state.plugins.length, 'Plugin identities are unique');
export type PluginLifecycleState = z.infer<typeof PluginLifecycleStateSchema>;
/** Capability targets a marketplace manifest can declare: strings or structured maps. */
const MarketplaceCapabilitySchema = z.union([z.string().min(1), z.array(z.string().min(1)), z.record(z.string(), JsonValueSchema)]);
/** Manifest detail fields, copied verbatim from the native marketplace catalog. */
export const MarketplacePluginDetailsSchema = z.strictObject({
 author: z.strictObject({ name: z.string().min(1), email: z.string().min(1).optional() }).optional(),
 homepage: z.string().min(1).optional(),
 repository: z.string().min(1).optional(),
 license: z.string().min(1).optional(),
 keywords: z.array(z.string().min(1)).optional(),
 category: z.string().min(1).optional(),
 tags: z.array(z.string().min(1)).optional(),
 commands: MarketplaceCapabilitySchema.optional(),
 agents: MarketplaceCapabilitySchema.optional(),
 hooks: MarketplaceCapabilitySchema.optional(),
 mcpServers: MarketplaceCapabilitySchema.optional(),
 lspServers: MarketplaceCapabilitySchema.optional(),
 dapAdapters: MarketplaceCapabilitySchema.optional(),
});
export type MarketplacePluginDetails = z.infer<typeof MarketplacePluginDetailsSchema>;
export const MarketplaceEntrySchema = z.strictObject({
 marketplace: z.string().min(1), name: z.string().min(1), description: z.string(), version: z.string().nullable(),
 details: MarketplacePluginDetailsSchema.optional(),
});
export type MarketplaceEntry = z.infer<typeof MarketplaceEntrySchema>;
/** One configured catalog source (`marketplaces.json`), never merged with installed state. */
export const MarketplaceSourceSchema = z.strictObject({
 name: z.string().min(1), sourceType: z.enum(['github', 'git', 'url', 'local']),
 sourceUri: z.string().min(1), catalogPath: z.string().min(1), addedAt: z.string().min(1), updatedAt: z.string().min(1),
});
export type MarketplaceSource = z.infer<typeof MarketplaceSourceSchema>;
/** A plugin a marketplace catalog publishes a newer version for, per installed scope. */
export const PluginUpdateCheckEntrySchema = z.strictObject({
 pluginId: z.string().min(1), target: PluginTargetSchema, scope: PluginScopeSchema, from: z.string().min(1), to: z.string().min(1),
}).superRefine((entry, context) => {
 if (entry.target.kind !== 'marketplace' || entry.target.scope !== (entry.scope === 'global' ? 'user' : 'project')) {
  context.addIssue({ code: 'custom', message: 'Marketplace update entries describe their native installed target' });
 }
});
export type PluginUpdateCheckEntry = z.infer<typeof PluginUpdateCheckEntrySchema>;
/** Native `previewUpgradePlugin` rows: what an upgrade would install, without writing. */
export const PluginUpgradePreviewEntrySchema = z.strictObject({
 pluginId: z.string().min(1), target: PluginTargetSchema, scope: PluginScopeSchema,
 from: z.string().min(1).nullable(), to: z.string().min(1).nullable(),
 change: z.enum(['upgrade', 'reinstall', 'downgrade']).nullable(),
});
export type PluginUpgradePreviewEntry = z.infer<typeof PluginUpgradePreviewEntrySchema>;
export const PluginUpdateCheckResultSchema = z.strictObject({
 workspaceId: EntityIdSchema, revision: CounterSchema, updates: z.array(PluginUpdateCheckEntrySchema),
});
export type PluginUpdateCheckResult = z.infer<typeof PluginUpdateCheckResultSchema>;
export const PluginUpgradePreviewResultSchema = z.strictObject({
 workspaceId: EntityIdSchema, revision: CounterSchema, preview: z.array(PluginUpgradePreviewEntrySchema),
});
export type PluginUpgradePreviewResult = z.infer<typeof PluginUpgradePreviewResultSchema>;
export const PluginMarketplaceStateSchema = z.strictObject({
 workspaceId: EntityIdSchema, revision: CounterSchema, entries: z.array(MarketplaceEntrySchema),
 sources: z.array(MarketplaceSourceSchema).default([]), updates: z.array(PluginUpdateCheckEntrySchema).default([]),
});
export type PluginMarketplaceState = z.infer<typeof PluginMarketplaceStateSchema>;
/** Configured catalog sources as the native registry reports them; never merged with installed state. */
export const PluginMarketplaceSourcesSchema = z.strictObject({
 workspaceId: EntityIdSchema, revision: CounterSchema, sources: z.array(MarketplaceSourceSchema),
});
export type PluginMarketplaceSources = z.infer<typeof PluginMarketplaceSourcesSchema>;
/**
 * Source management is the only marketplace action that reaches the network.
 * `list` and the catalog snapshot read cached state; refreshes are explicit.
 * `list` is a read, so it carries no expected revision and never commits one.
 */
export const PluginMarketplaceManageRequestSchema = z.discriminatedUnion('action', [
 z.strictObject({ action: z.literal('list') }),
 z.strictObject({ action: z.literal('add'), expectedRevision: CounterSchema, source: z.string().min(1).max(2048) }),
 z.strictObject({ action: z.literal('remove'), expectedRevision: CounterSchema, name: z.string().min(1) }),
 z.strictObject({ action: z.literal('update'), expectedRevision: CounterSchema, name: z.string().min(1).optional() }),
]);
/** Manage requests that write the native registry; `list` is a read and returns sources instead. */
export type PluginMarketplaceMutationRequest = Exclude<PluginMarketplaceManageRequest, { action: 'list' }>;
export type PluginMarketplaceManageRequest = z.infer<typeof PluginMarketplaceManageRequestSchema>;
/** Preview is a read of the native upgrade plan; `target` selects one plugin, absent selects every outdated one. */
export const PluginPreviewUpgradeRequestSchema = z.strictObject({ target: PluginTargetSchema.optional() });
export type PluginPreviewUpgradeRequest = z.infer<typeof PluginPreviewUpgradeRequestSchema>;
export const PluginUpgradeAllRequestSchema = z.strictObject({ expectedRevision: CounterSchema });
export type PluginUpgradeAllRequest = z.infer<typeof PluginUpgradeAllRequestSchema>;
export const PluginUpgradeRequestSchema = z.strictObject({ expectedRevision: CounterSchema, target: PluginTargetSchema });
export type PluginUpgradeRequest = z.infer<typeof PluginUpgradeRequestSchema>;
export const LocalExtensionIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:ts|js|mts|mjs)$/).max(160);
export const LocalExtensionEntrySchema = z.strictObject({ extensionId: LocalExtensionIdSchema, relativePath: z.string() }).refine(
 extension => extension.relativePath === `.omp/extensions/${extension.extensionId}`, 'Extension paths identify their confined workspace source',
);
export type LocalExtensionEntry = z.infer<typeof LocalExtensionEntrySchema>;
export const LocalExtensionSourceSchema = z.strictObject({ workspaceId: EntityIdSchema, revision: CounterSchema, extension: LocalExtensionEntrySchema, content: z.string().max(1048576) });
export type LocalExtensionSource = z.infer<typeof LocalExtensionSourceSchema>;
export const PluginRuntimeStateSchema = z.strictObject({
 worker: CatalogWorkerIdentitySchema, status: z.enum(['ready', 'unavailable']), appliedRevision: CounterSchema.nullable(), error: CatalogOperationErrorSchema.nullable(),
}).refine(state => state.status !== 'ready' || state.appliedRevision !== null && state.error === null,
 'Ready plugin workers have a successful applied publication');
export type PluginRuntimeState = z.infer<typeof PluginRuntimeStateSchema>;
/**
 * Discovery provider inventory from OMP's capability registry. Every registered
 * provider is reported with its exact switch state, including providers that
 * currently discover no items, so a disabled provider never disappears from the
 * control surface.
 */
export const ExtensionProviderEntrySchema = z.strictObject({
 id: z.string().min(1),
 displayName: z.string().min(1),
 description: z.string(),
 priority: z.number().int(),
 capabilities: z.array(z.string().min(1)),
 enabled: z.boolean(),
 userSourceEnabled: z.boolean(),
 foreignUserSource: z.boolean(),
 itemCount: z.number().int().nonnegative(),
});
export type ExtensionProviderEntry = z.infer<typeof ExtensionProviderEntrySchema>;

export const ExtensionKindSchema = z.enum([
 'extension-module', 'skill', 'rule', 'tool', 'mcp', 'prompt', 'instruction', 'context-file', 'hook', 'slash-command', 'ssh',
]);
export type ExtensionKind = z.infer<typeof ExtensionKindSchema>;

/** Native user/project/native levels, with native reported as the `builtin` scope. */
export const ExtensionScopeSchema = z.enum(['user', 'project', 'builtin']);
export type ExtensionScope = z.infer<typeof ExtensionScopeSchema>;
/**
 * Why a row is inactive. Two independent authorities remain distinct: the native
 * switch itself (`enabled`, `shadowed`) and the reason it is off.
 */
export const ExtensionDisabledReasonSchema = z.enum(['provider-disabled', 'user-opt-in', 'item-disabled']);
export type ExtensionDisabledReason = z.infer<typeof ExtensionDisabledReasonSchema>;

/** Sanitized, non-secret facts about an item; never carries credentials or private material. */
export const ExtensionItemMetadataSchema = z.strictObject({
 transport: z.enum(['stdio', 'sse', 'http']).optional(),
 host: z.string().min(1).optional(),
 username: z.string().min(1).optional(),
 port: z.number().int().positive().optional(),
 requiresOptIn: z.boolean().optional(),
});
export type ExtensionItemMetadata = z.infer<typeof ExtensionItemMetadataSchema>;

export const ExtensionItemSchema = z.strictObject({
 /** Opaque stable row identity; shadowed duplicates never share it. */
 id: EntityIdSchema,
 kind: ExtensionKindSchema,
 name: z.string().min(1),
 providerId: z.string().min(1).describe('id of the discovery provider that reported this row'),
 providerName: z.string().min(1),
 scope: ExtensionScopeSchema,
 /** Display-safe path: home-relative, workspace-relative or an abbreviated tail. */
 path: z.string().min(1),
 /** Independent native switch: false when the provider, user opt-in gate or item switch turns this row off. */
 enabled: z.boolean(),
 /** A lower-precedence copy of another same-name row; never independently toggleable. */
 shadowed: z.boolean(),
 shadowedBy: z.string().min(1).optional(),
 /** Which switch turned this row off; absent while enabled. */
 disabledReason: ExtensionDisabledReasonSchema.optional(),
 /**
 * Native `disabledExtensions` identity this row toggles. Private to the service:
 * callers toggle rows by {@link ExtensionItem.id}, never by this value.
 */
 toggleable: z.boolean(),
 description: z.string().optional(),
 triggers: z.array(z.string()),
 /** Knowledge-body content for inspector; absent for profiles and connection items. */
 content: z.string().optional(),
 metadata: ExtensionItemMetadataSchema.optional(),
}).superRefine((item, context) => {
 if (item.shadowed && item.enabled) {
  context.addIssue({ code: 'custom', path: ['enabled'], message: 'Shadowed rows are never enabled' });
 }
 if (!item.shadowed && item.disabledReason === undefined && !item.enabled) {
  context.addIssue({ code: 'custom', path: ['disabledReason'], message: 'Disabled rows name the switch that turned them off' });
 }
 if (item.shadowed && item.disabledReason !== undefined) {
  context.addIssue({ code: 'custom', path: ['disabledReason'], message: 'Shadowed rows report shadowing, not a disabled reason' });
 }
 if (item.shadowed && !item.shadowedBy) {
  context.addIssue({ code: 'custom', path: ['shadowedBy'], message: 'Shadowed rows name the row that shadows them' });
 }
});
export type ExtensionItem = z.infer<typeof ExtensionItemSchema>;

export const ExtensionInventorySchema = z.strictObject({
 providers: z.array(ExtensionProviderEntrySchema),
 items: z.array(ExtensionItemSchema),
 warnings: z.array(z.string()),
 /** Native capability display names per kind, so no label is invented in the UI. */
 kinds: z.array(z.strictObject({ kind: ExtensionKindSchema, label: z.string().min(1) })),
}).refine(inventory => new Set(inventory.providers.map(provider => provider.id)).size === inventory.providers.length,
 'Discovery providers have unique identities',
).refine(inventory => new Set(inventory.kinds.map(entry => entry.kind)).size === inventory.kinds.length,
 'Extension kinds have unique labels',
).refine(inventory => new Set(inventory.items.map(item => item.id)).size === inventory.items.length,
 'Extension rows have unique identities',
).refine(inventory => inventory.items.every(item => inventory.providers.some(provider => provider.id === item.providerId)),
 'Extension rows name a reported discovery provider',
);
export type ExtensionInventory = z.infer<typeof ExtensionInventorySchema>;

export const ExtensionInventoryStateSchema = z.strictObject({
 workspaceId: EntityIdSchema, revision: CounterSchema, extensions: ExtensionInventorySchema,
});
export type ExtensionInventoryState = z.infer<typeof ExtensionInventoryStateSchema>;

/**
 * Toggles persist native `disabledProviders` / `enabledProviders` /
 * `disabledExtensions` settings. The request owns the expected workspace
 * catalog revision so a stale editor cannot overwrite a newer save.
 */
export const ExtensionToggleRequestSchema = z.strictObject({
 expectedRevision: CounterSchema,
 providerId: z.string().min(1),
 enabled: z.boolean(),
 userSource: z.boolean().optional(),
 /** Row `id` to toggle; a provider-level request omits it. */
 extensionId: EntityIdSchema.optional(),
}).superRefine((request, context) => {
 if (request.extensionId !== undefined && request.userSource === true) {
  context.addIssue({ code: 'custom', path: ['userSource'], message: 'Item toggles do not change user-source opt-in' });
 }
});
export type ExtensionToggleRequest = z.infer<typeof ExtensionToggleRequestSchema>;

export const PluginCatalogStateSchema = z.strictObject({
 workspaceId: EntityIdSchema, revision: CounterSchema, plugins: z.array(InstalledPluginEntrySchema),
 marketplace: z.array(MarketplaceEntrySchema), localExtensions: z.array(LocalExtensionEntrySchema), workers: z.array(PluginRuntimeStateSchema),
 marketplaceSources: z.array(MarketplaceSourceSchema).default([]),
 availableUpdates: z.array(PluginUpdateCheckEntrySchema).default([]),
 extensions: ExtensionInventorySchema,
}).refine(catalog => new Set(catalog.plugins.map(plugin => plugin.id)).size === catalog.plugins.length
 && new Set(catalog.localExtensions.map(extension => extension.extensionId)).size === catalog.localExtensions.length,
 'Plugin and local extension identities are unique').refine(
  catalog => catalog.workers.every(({ worker }) => worker.workspaceId === catalog.workspaceId),
  'Catalog runtime state describes only the requested workspace',
 );
export type PluginCatalogState = z.infer<typeof PluginCatalogStateSchema>;
export const PluginInstallRequestSchema = z.strictObject({
 expectedRevision: CounterSchema, source: z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('package'), spec: z.string().min(1).max(2048) }),
  z.strictObject({ kind: z.literal('marketplace'), name: z.string().min(1), marketplace: z.string().min(1), scope: z.enum(['user', 'project']) }),
 ])
});
export type PluginInstallRequest = z.infer<typeof PluginInstallRequestSchema>;
export const PluginUninstallRequestSchema = z.strictObject({ expectedRevision: CounterSchema, target: PluginTargetSchema });
export type PluginUninstallRequest = z.infer<typeof PluginUninstallRequestSchema>;
export const PluginConfigureRequestSchema = z.strictObject({
 expectedRevision: CounterSchema, target: PluginTargetSchema, enabled: z.boolean().optional(),
 enabledFeatures: z.array(z.string().min(1)).refine(names => new Set(names).size === names.length).nullable().optional(),
 settingsScope: PluginScopeSchema.optional(), settings: JsonObjectSchema.optional(),
}).refine(request => request.enabled !== undefined || request.settings !== undefined || request.enabledFeatures !== undefined, 'A plugin configuration change is required')
 .refine(request => (request.settings === undefined && request.enabledFeatures === undefined) || request.settingsScope !== undefined,
  'Settings and feature writes explicitly select a native scope')
 .refine(request => request.enabledFeatures === undefined || request.settingsScope === 'workspace'
  || request.target.kind === 'package' || request.target.scope === 'user', 'Project marketplace installs require workspace feature selection');
export type PluginConfigureRequest = z.infer<typeof PluginConfigureRequestSchema>;
export const LocalExtensionWriteRequestSchema = z.strictObject({ expectedRevision: CounterSchema, extensionId: LocalExtensionIdSchema, content: z.string().max(1048576) });
export type LocalExtensionWriteRequest = z.infer<typeof LocalExtensionWriteRequestSchema>;
export const LocalExtensionDeleteRequestSchema = z.strictObject({ expectedRevision: CounterSchema, extensionId: LocalExtensionIdSchema });
export type LocalExtensionDeleteRequest = z.infer<typeof LocalExtensionDeleteRequestSchema>;
export const PluginWorkerApplyOutcomeSchema = z.discriminatedUnion('outcome', [
 z.strictObject({ worker: CatalogWorkerIdentitySchema, outcome: z.literal('applied'), appliedRevision: CounterSchema }),
 z.strictObject({ worker: CatalogWorkerIdentitySchema, outcome: z.literal('failed'), appliedRevision: CounterSchema.nullable(), error: CatalogOperationErrorSchema }),
 z.strictObject({ worker: CatalogWorkerIdentitySchema, outcome: z.literal('retired') }),
]);
export type PluginWorkerApplyOutcome = z.infer<typeof PluginWorkerApplyOutcomeSchema>;
export const PluginMutationResultSchema = z.strictObject({
 workspaceId: EntityIdSchema, revision: CounterSchema, persistence: z.literal('committed'), catalog: PluginCatalogStateSchema,
 status: z.enum(['applied', 'partial', 'failed', 'no-active-workers']), workers: z.array(PluginWorkerApplyOutcomeSchema),
}).superRefine((result, context) => {
 const applied = result.workers.filter(worker => worker.outcome === 'applied').length;
 const failed = result.workers.filter(worker => worker.outcome === 'failed').length;
 const status = applied > 0 ? (failed > 0 ? 'partial' : 'applied') : (failed > 0 ? 'failed' : 'no-active-workers');
 if (result.status !== status || result.catalog.revision !== result.revision || result.catalog.workspaceId !== result.workspaceId) {
  context.addIssue({ code: 'custom', message: 'Plugin persistence and runtime outcomes must describe the committed catalog' });
 }
 if (result.workers.some(worker => worker.outcome === 'applied' && worker.appliedRevision !== result.revision)) {
  context.addIssue({ code: 'custom', message: 'Applied workers published the committed revision' });
 }
 if (new Set(result.workers.map(({ worker }) => JSON.stringify([worker.rootSessionId, worker.workerGeneration]))).size !== result.workers.length) {
  context.addIssue({ code: 'custom', message: 'Plugin worker outcomes have unique generation identities' });
 }
});
export type PluginMutationResult = z.infer<typeof PluginMutationResultSchema>;
export const PluginDoctorCheckSchema = z.strictObject({ name: z.string().min(1), status: z.enum(['ok', 'warning', 'error']), message: z.string(), fixed: z.boolean().optional() });
export type PluginDoctorCheck = z.infer<typeof PluginDoctorCheckSchema>;
export const PluginDoctorResultSchema = z.strictObject({ workspaceId: EntityIdSchema, revision: CounterSchema, checks: z.array(PluginDoctorCheckSchema) });
export type PluginDoctorResult = z.infer<typeof PluginDoctorResultSchema>;
export const PluginApplyRequestSchema = z.strictObject({
 expectedRevision: CounterSchema,
 strategy: z.literal('restart-idle-sessions'),
});
export type PluginApplyRequest = z.infer<typeof PluginApplyRequestSchema>;
