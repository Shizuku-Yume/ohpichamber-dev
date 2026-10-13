import {
  MCPApplyRequestSchema, MCPConfigurationStateSchema, MCPConfigureRequestSchema,
  MCPReconnectRequestSchema, MCPCatalogReadSchema, MCPWorkerApplyOutcomeSchema,
  EntityIdSchema, MCPOAuthRequestSchema, MCPOAuthResultSchema,
} from '@openchamber/agent-contract';
import { z } from 'zod';

export const McpOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('read'), configuration: MCPConfigurationStateSchema }),
  z.strictObject({ type: z.literal('persist'), request: MCPConfigureRequestSchema, configuration: MCPConfigurationStateSchema }),
  z.strictObject({ type: z.literal('apply'), request: MCPApplyRequestSchema, configuration: MCPConfigurationStateSchema }),
  z.strictObject({ type: z.literal('reconnect'), serverId: EntityIdSchema, request: MCPReconnectRequestSchema, configuration: MCPConfigurationStateSchema }),
  z.strictObject({ type: z.literal('oauth.status'), serverId: EntityIdSchema, configuration: MCPConfigurationStateSchema }),
  z.strictObject({ type: z.literal('oauth'), serverId: EntityIdSchema, request: MCPOAuthRequestSchema, configuration: MCPConfigurationStateSchema }),
]);
export type McpOperation = z.infer<typeof McpOperationSchema>;

export const McpResultSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('catalog'), catalog: MCPCatalogReadSchema }),
  z.strictObject({ type: z.literal('persisted'), configuration: MCPConfigurationStateSchema }),
  z.strictObject({ type: z.literal('applied'), result: MCPWorkerApplyOutcomeSchema }),
  z.strictObject({ type: z.literal('oauth'), result: MCPOAuthResultSchema }),
]);
export type McpResult = z.infer<typeof McpResultSchema>;
