import { z } from 'zod';
import {
  CounterSchema, PluginInstallRequestSchema, PluginUninstallRequestSchema, PluginConfigureRequestSchema,
  LocalExtensionWriteRequestSchema, LocalExtensionDeleteRequestSchema,
  PluginCatalogStateSchema, PluginDoctorResultSchema, PluginMarketplaceStateSchema, LocalExtensionSourceSchema,
  PluginWorkerApplyOutcomeSchema, PluginMutationResultSchema, PluginMarketplaceManageRequestSchema,
  PluginPreviewUpgradeRequestSchema, PluginUpgradeAllRequestSchema, PluginUpgradeRequestSchema,
  PluginUpdateCheckResultSchema, PluginUpgradePreviewResultSchema, PluginMarketplaceSourcesSchema,
  ExtensionInventoryStateSchema, ExtensionToggleRequestSchema, PluginLifecycleStateSchema,
} from '@openchamber/agent-contract';

/**
  * Native capability-control operations. They are separate from plugin-registry
  * operations because their authoritative state is native settings
  * (`disabledProviders` / `enabledProviders` / `disabledExtensions`), not the
  * plugin lockfile; the workspace catalog owner revision still guards writes.
  */
export const NativeExtensionOperationSchemas = [
  z.strictObject({ type: z.literal('extensions.read') }),
  z.strictObject({ type: z.literal('extensions.toggle'), request: ExtensionToggleRequestSchema }),
] as const;
export const NativeExtensionOperationSchema = z.discriminatedUnion('type', NativeExtensionOperationSchemas);
export type NativeExtensionOperation = z.infer<typeof NativeExtensionOperationSchema>;
export const NativeExtensionResultSchemas = [
  z.strictObject({ type: z.literal('extensions.inventory'), state: ExtensionInventoryStateSchema }),
] as const;
const NativeExtensionResultSchema = z.discriminatedUnion('type', NativeExtensionResultSchemas);
export type NativeExtensionResult = z.infer<typeof NativeExtensionResultSchema>;

export const NativePluginOperationSchemas = [
  z.strictObject({ type: z.literal('plugins.read') }),
  z.strictObject({ type: z.literal('plugins.lifecycle') }),
  z.strictObject({ type: z.literal('plugins.owner') }),
  z.strictObject({ type: z.literal('plugins.doctor') }),
  // Cached marketplace catalog, sources and update list: no network access on read.
  z.strictObject({ type: z.literal('plugins.marketplace') }),
  z.strictObject({ type: z.literal('plugins.marketplace.manage'), request: PluginMarketplaceManageRequestSchema }),
  z.strictObject({ type: z.literal('plugins.marketplace.checkUpdates') }),
  z.strictObject({ type: z.literal('plugins.marketplace.previewUpgrade'), request: PluginPreviewUpgradeRequestSchema }),
  z.strictObject({ type: z.literal('plugins.marketplace.upgradeAll'), request: PluginUpgradeAllRequestSchema }),
  z.strictObject({ type: z.literal('plugins.install'), request: PluginInstallRequestSchema }),
  z.strictObject({ type: z.literal('plugins.uninstall'), request: PluginUninstallRequestSchema }),
  z.strictObject({ type: z.literal('plugins.configure'), request: PluginConfigureRequestSchema }),
  z.strictObject({ type: z.literal('plugins.update'), request: PluginUpgradeRequestSchema }),
  z.strictObject({ type: z.literal('plugins.local.read'), extensionId: z.string() }),
  z.strictObject({ type: z.literal('plugins.local.write'), request: LocalExtensionWriteRequestSchema }),
  z.strictObject({ type: z.literal('plugins.local.delete'), request: LocalExtensionDeleteRequestSchema }),
  z.strictObject({ type: z.literal('plugins.apply'), persistedRevision: CounterSchema }),
] as const;
export const NativePluginOperationSchema = z.discriminatedUnion('type', NativePluginOperationSchemas);
export type NativePluginOperation = z.infer<typeof NativePluginOperationSchema>;
export const NativePluginResultSchemas = [
  z.strictObject({ type: z.literal('plugins.catalog'), catalog: PluginCatalogStateSchema }),
  z.strictObject({ type: z.literal('plugins.lifecycle'), result: PluginLifecycleStateSchema }),
  z.strictObject({ type: z.literal('plugins.owner'), rootPath: z.string().min(1), localSourcePath: z.string().min(1),
    projectRegistryPath: z.string().min(1).nullable(), overridesPath: z.string().min(1) }),
  z.strictObject({ type: z.literal('plugins.mutated'), result: PluginMutationResultSchema }),
  z.strictObject({ type: z.literal('plugins.doctor'), result: PluginDoctorResultSchema }),
  z.strictObject({ type: z.literal('plugins.marketplace'), result: PluginMarketplaceStateSchema }),
  z.strictObject({ type: z.literal('plugins.updateCheck'), result: PluginUpdateCheckResultSchema }),
  z.strictObject({ type: z.literal('plugins.marketplaceSources'), result: PluginMarketplaceSourcesSchema }),
  z.strictObject({ type: z.literal('plugins.upgradePreview'), result: PluginUpgradePreviewResultSchema }),
  z.strictObject({ type: z.literal('plugins.local'), result: LocalExtensionSourceSchema }),
  z.strictObject({ type: z.literal('plugins.applied'), result: PluginWorkerApplyOutcomeSchema }),
] as const;
const NativePluginResultSchema = z.discriminatedUnion('type', NativePluginResultSchemas);
export type NativePluginResult = z.infer<typeof NativePluginResultSchema>;
