import {
  MCPApplyRequestSchema, MCPConfigurationStateSchema, MCPConfigureRequestSchema,
  MCPReconnectRequestSchema, MCPCatalogReadSchema, MCPWorkerApplyOutcomeSchema,
  EntityIdSchema, CounterSchema, MCPOAuthRequestSchema, MCPOAuthResultSchema,
  MCPConnectionTestResultSchema, MCPSecretWriteRequestSchema, MCPSecretWriteResultSchema,
} from '@openchamber/agent-contract';
import { z } from 'zod';

/** One tool of an enabled server, named through a real isolated handshake. */
export const MCPDiscoveredToolSchema = z.strictObject({
  serverId: EntityIdSchema,
  name: z.string().min(1),
  description: z.string(),
});
export type MCPDiscoveredTool = z.infer<typeof MCPDiscoveredToolSchema>;

export const MCPToolDiscoverySchema = z.strictObject({
  workspaceId: EntityIdSchema,
  persistedRevision: CounterSchema,
  tools: z.array(MCPDiscoveredToolSchema),
});
export type MCPToolDiscovery = z.infer<typeof MCPToolDiscoverySchema>;

export const McpOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('read'), configuration: MCPConfigurationStateSchema }),
  z.strictObject({ type: z.literal('persist'), request: MCPConfigureRequestSchema, configuration: MCPConfigurationStateSchema }),
  z.strictObject({ type: z.literal('apply'), request: MCPApplyRequestSchema, configuration: MCPConfigurationStateSchema }),
  z.strictObject({ type: z.literal('reconnect'), serverId: EntityIdSchema, request: MCPReconnectRequestSchema, configuration: MCPConfigurationStateSchema }),
  z.strictObject({ type: z.literal('oauth.status'), serverId: EntityIdSchema, configuration: MCPConfigurationStateSchema }),
  z.strictObject({ type: z.literal('oauth'), serverId: EntityIdSchema, request: MCPOAuthRequestSchema, configuration: MCPConfigurationStateSchema }),
  z.strictObject({ type: z.literal('test'), serverId: EntityIdSchema, configuration: MCPConfigurationStateSchema }),
  z.strictObject({ type: z.literal('discover'), configuration: MCPConfigurationStateSchema }),
  z.strictObject({ type: z.literal('secret.write'), serverId: EntityIdSchema, request: MCPSecretWriteRequestSchema, configuration: MCPConfigurationStateSchema }),
]);
export type McpOperation = z.infer<typeof McpOperationSchema>;

export const McpResultSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('catalog'), catalog: MCPCatalogReadSchema }),
  z.strictObject({ type: z.literal('persisted'), configuration: MCPConfigurationStateSchema, needsCredentialReentry: z.array(EntityIdSchema).min(1).optional() }),
  z.strictObject({ type: z.literal('applied'), result: MCPWorkerApplyOutcomeSchema }),
  z.strictObject({ type: z.literal('oauth'), result: MCPOAuthResultSchema }),
  z.strictObject({ type: z.literal('tested'), result: MCPConnectionTestResultSchema }),
  z.strictObject({ type: z.literal('discovered'), result: MCPToolDiscoverySchema }),
  z.strictObject({ type: z.literal('secret.written'), result: MCPSecretWriteResultSchema }),
]);
