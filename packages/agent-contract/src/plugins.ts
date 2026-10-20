import { z } from 'zod';
import { CounterSchema, EntityIdSchema, JsonObjectSchema } from './primitives.ts';
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
export const MarketplaceEntrySchema = z.strictObject({
  marketplace: z.string().min(1), name: z.string().min(1), description: z.string(), version: z.string().nullable(),
});
export type MarketplaceEntry = z.infer<typeof MarketplaceEntrySchema>;
export const PluginMarketplaceStateSchema = z.strictObject({ workspaceId: EntityIdSchema, revision: CounterSchema, entries: z.array(MarketplaceEntrySchema) });
export type PluginMarketplaceState = z.infer<typeof PluginMarketplaceStateSchema>;
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
export const PluginCatalogStateSchema = z.strictObject({
  workspaceId: EntityIdSchema, revision: CounterSchema, plugins: z.array(InstalledPluginEntrySchema),
  marketplace: z.array(MarketplaceEntrySchema), localExtensions: z.array(LocalExtensionEntrySchema), workers: z.array(PluginRuntimeStateSchema),
}).refine(catalog => new Set(catalog.plugins.map(plugin => plugin.id)).size === catalog.plugins.length
  && new Set(catalog.localExtensions.map(extension => extension.extensionId)).size === catalog.localExtensions.length,
'Plugin and local extension identities are unique').refine(
  catalog => catalog.workers.every(({ worker }) => worker.workspaceId === catalog.workspaceId),
  'Catalog runtime state describes only the requested workspace',
);
export type PluginCatalogState = z.infer<typeof PluginCatalogStateSchema>;
export const PluginInstallRequestSchema = z.strictObject({ expectedRevision: CounterSchema, source: z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('package'), spec: z.string().min(1).max(2048) }),
  z.strictObject({ kind: z.literal('marketplace'), name: z.string().min(1), marketplace: z.string().min(1), scope: z.enum(['user', 'project']) }),
]) });
export type PluginInstallRequest = z.infer<typeof PluginInstallRequestSchema>;
export const PluginUninstallRequestSchema = z.strictObject({ expectedRevision: CounterSchema, target: PluginTargetSchema });
export type PluginUninstallRequest = z.infer<typeof PluginUninstallRequestSchema>;
export const PluginUpdateRequestSchema = PluginUninstallRequestSchema;
export type PluginUpdateRequest = z.infer<typeof PluginUpdateRequestSchema>;
// Settings replace declared nonsecret GLOBAL overrides; omitted secret keys remain private and unchanged.
// Native project overrides are read inputs, never synthesized writes; saved-global and effective values are distinct.
export const PluginConfigureRequestSchema = z.strictObject({
  expectedRevision: CounterSchema, target: PluginTargetSchema, enabled: z.boolean().optional(),
  settingsScope: z.literal('global').optional(), settings: JsonObjectSchema.optional(),
}).refine(request => request.enabled !== undefined || request.settings !== undefined, 'A plugin configuration change is required')
  .refine(request => request.settings === undefined || request.settingsScope === 'global', 'Setting writes explicitly target native global scope');
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
