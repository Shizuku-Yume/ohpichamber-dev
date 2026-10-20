import { z } from 'zod';
import {
  CounterSchema, PluginInstallRequestSchema, PluginUninstallRequestSchema, PluginConfigureRequestSchema,
  PluginUpdateRequestSchema, LocalExtensionWriteRequestSchema, LocalExtensionDeleteRequestSchema,
  PluginCatalogStateSchema, PluginDoctorResultSchema, PluginMarketplaceStateSchema, LocalExtensionSourceSchema,
  PluginWorkerApplyOutcomeSchema, PluginMutationResultSchema,
} from '@openchamber/agent-contract';

export const NativePluginOperationSchemas = [
  z.strictObject({ type: z.literal('plugins.read') }),
  z.strictObject({ type: z.literal('plugins.owner') }),
  z.strictObject({ type: z.literal('plugins.doctor') }),
  z.strictObject({ type: z.literal('plugins.marketplace') }),
  z.strictObject({ type: z.literal('plugins.install'), request: PluginInstallRequestSchema }),
  z.strictObject({ type: z.literal('plugins.uninstall'), request: PluginUninstallRequestSchema }),
  z.strictObject({ type: z.literal('plugins.configure'), request: PluginConfigureRequestSchema }),
  z.strictObject({ type: z.literal('plugins.update'), request: PluginUpdateRequestSchema }),
  z.strictObject({ type: z.literal('plugins.local.read'), extensionId: z.string() }),
  z.strictObject({ type: z.literal('plugins.local.write'), request: LocalExtensionWriteRequestSchema }),
  z.strictObject({ type: z.literal('plugins.local.delete'), request: LocalExtensionDeleteRequestSchema }),
  z.strictObject({ type: z.literal('plugins.apply'), persistedRevision: CounterSchema }),
] as const;
export const NativePluginOperationSchema = z.discriminatedUnion('type', NativePluginOperationSchemas);
export type NativePluginOperation = z.infer<typeof NativePluginOperationSchema>;
export const NativePluginResultSchemas = [
  z.strictObject({ type: z.literal('plugins.catalog'), catalog: PluginCatalogStateSchema }),
  z.strictObject({ type: z.literal('plugins.owner'), rootPath: z.string().min(1), localSourcePath: z.string().min(1), projectRegistryPath: z.string().min(1).nullable() }),
  z.strictObject({ type: z.literal('plugins.mutated'), result: PluginMutationResultSchema }),
  z.strictObject({ type: z.literal('plugins.doctor'), result: PluginDoctorResultSchema }),
  z.strictObject({ type: z.literal('plugins.marketplace'), result: PluginMarketplaceStateSchema }),
  z.strictObject({ type: z.literal('plugins.local'), result: LocalExtensionSourceSchema }),
  z.strictObject({ type: z.literal('plugins.applied'), result: PluginWorkerApplyOutcomeSchema }),
] as const;
export const NativePluginResultSchema = z.discriminatedUnion('type', NativePluginResultSchemas);
export type NativePluginResult = z.infer<typeof NativePluginResultSchema>;
