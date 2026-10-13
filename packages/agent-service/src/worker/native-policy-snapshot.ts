import type { MCPServerConfig } from '@openchamber/agent-contract';
import { HostNativePolicySnapshotSchema, type HostNativePolicySnapshot } from '../native-policy-protocol.ts';
import type { NativeWorkerRuntime } from './native-runtime.ts';
import type { NativeAgents } from './catalog-agents.ts';

/** Captures installed native catalog facts, never Host machine grants or credential material. */
export async function captureNativePolicy(input: { projectId: string; workspaceId: string; cwd: string; agentDirectory: string; agentDirectoryId: string }, runtime: NativeWorkerRuntime, agents: NativeAgents, mcpServers: MCPServerConfig[]): Promise<HostNativePolicySnapshot> {
  const catalog = await runtime.models.readModels(input.workspaceId, '0');
  const providersCatalog = await runtime.models.readProviders(input.workspaceId, '0');
  const profiles = await agents.read(input.workspaceId, '0');
  const models = runtime.modelRegistry.getAll('all');
  const providers: HostNativePolicySnapshot['providers'] = [];
  for (const model of catalog.models) {
    if (!model.enabled) continue;
    const native = models.find(candidate => candidate.id === model.modelId && candidate.provider === model.provider);
    if (!native) continue;
    const provider = providersCatalog.providers.find(candidate => candidate.providerId === native.provider);
    providers.push({ providerId: native.provider, modelId: native.id, ...(provider?.endpoint === null || provider?.endpoint === undefined ? {} : { endpoint: provider.endpoint }) });
  }
  return HostNativePolicySnapshotSchema.parse({ ...input, providers, mcpServers, agentIds: profiles.agents.map(agent => agent.agentId), permissionPresetIds: [...new Set(profiles.agents.flatMap(agent => agent.permissionPresetId === undefined ? [] : [agent.permissionPresetId]))] });
}
