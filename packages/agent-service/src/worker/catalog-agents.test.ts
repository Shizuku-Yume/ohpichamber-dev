import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILTIN_TOOL_NAMES } from '@oh-my-pi/pi-coding-agent/tools/builtin-names';
import { NativeAgents } from './catalog-agents.ts';
import { NativeModels } from './catalog-models.ts';
import { nativeExtensionRoots, nativeModelsContext, openNativeRuntime } from './native-runtime.ts';

test('agent profile mutations round-trip through native markdown and model resolution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-agents-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  try {
    const models = new NativeModels(nativeModelsContext(runtime, () => 'gen-1'));
    await models.configureProvider({ expectedRevision: '0', configuration: {
      providerId: 'm212-loopback', name: 'Loopback provider', endpoint: 'http://127.0.0.1:18080/v1', protocol: 'chat-completions', credentialRef: null,
    } }, '1');
    await models.configureModel({ expectedRevision: '1', model: {
      modelId: 'm212-model', provider: 'm212-loopback', name: 'Loopback text', modalities: ['text'], contextWindow: 65536,
      maxOutputTokens: 256, reasoningEffortSupported: false, reasoningOptions: [], variants: [], toolsSupported: true, enabled: true, pricing: null,
    } }, '2');
    const agents = new NativeAgents({ cwd, agentDirectory, modelRegistry: runtime.modelRegistry, settings: runtime.settings,
      extensionRoots: nativeExtensionRoots(runtime.settings), permissionPreset: async () => {}, availableToolNames: () => BUILTIN_TOOL_NAMES });
    const agent = { agentId: 'm212-profile', name: 'Proof profile', description: 'Finite profile selection',
      model: { providerId: 'm212-loopback', modelId: 'm212-model' }, allowedTools: ['bash'], systemPromptOverride: 'M212_PROFILE_SELECTED_NATIVE_SYSTEM' };
    await agents.create({ expectedRevision: '2', agent }, '3');
    expect(await agents.profile(agent.agentId)).toEqual(agent);
    const updatedAgent = { ...agent, name: 'Updated proof profile' };
    await agents.update({ expectedRevision: '3', agent: updatedAgent }, '4');
    const catalog = await agents.read('workspace_1', '4');
    expect(catalog.agents.find(entry => entry.agentId === agent.agentId)).toEqual(updatedAgent);
    await agents.delete({ expectedRevision: '4', agentId: agent.agentId }, '5');
    const afterDelete = await agents.read('workspace_1', '5');
    expect(afterDelete.agents.some(entry => entry.agentId === agent.agentId)).toBe(false);
  } finally {
    runtime.authStorage.close();
    await rm(root, { recursive: true, force: true });
  }
});
