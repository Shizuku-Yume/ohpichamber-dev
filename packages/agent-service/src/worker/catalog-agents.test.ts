import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILTIN_TOOL_NAMES } from '@oh-my-pi/pi-coding-agent/tools/builtin-names';
import { Settings, resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { ModelRegistry } from '@oh-my-pi/pi-coding-agent/config/model-registry';
import { loadBundledAgents } from '@oh-my-pi/pi-coding-agent/task/agents';
import { NativeAgents } from './catalog-agents.ts';
import { nativeExtensionRoots, nativeModelsContext, openNativeRuntime } from './native-runtime.ts';

beforeEach(resetSettingsForTest);
afterEach(resetSettingsForTest);

test('agent profile mutations round-trip through native markdown and model resolution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-agents-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  try {
    nativeModelsContext(runtime, () => 'gen-1');
    const models = runtime.models;
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
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

test('a long-lived native profile reader observes bundled deletion and subsequent replacement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-agents-readers-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  const readerSettings = await Settings.loadIsolated({ cwd, agentDir: agentDirectory });
  const readerRegistry = new ModelRegistry(runtime.authStorage, runtime.modelsPath, { settings: readerSettings });
  const owner = new NativeAgents({ cwd, agentDirectory, modelRegistry: runtime.modelRegistry, settings: runtime.settings,
    extensionRoots: nativeExtensionRoots(runtime.settings), permissionPreset: async () => {}, availableToolNames: () => BUILTIN_TOOL_NAMES });
  const reader = new NativeAgents({ cwd, agentDirectory, modelRegistry: readerRegistry, settings: readerSettings,
    extensionRoots: nativeExtensionRoots(readerSettings), permissionPreset: async () => {}, availableToolNames: () => BUILTIN_TOOL_NAMES });
  const bundled = loadBundledAgents()[0];
  if (!bundled) throw new Error('Pinned native catalog must contain a bundled profile');
  try {
    expect((await reader.definition(bundled.name)).source).toBe('bundled');
    await owner.delete({ expectedRevision: '0', agentId: bundled.name }, '1');
    await expect(reader.definition(bundled.name)).rejects.toMatchObject({ status: 404 });
    expect((await reader.read('workspace_1', '1')).agents.some(agent => agent.agentId === bundled.name)).toBe(false);
    const replacement = { agentId: bundled.name, name: 'Replacement profile', description: 'Native project override',
      model: null, allowedTools: ['bash'], systemPromptOverride: 'Replacement native system prompt' };
    await owner.update({ expectedRevision: '1', agent: replacement }, '2');
    expect(await reader.profile(bundled.name)).toEqual(replacement);
  } finally {
    runtime.authStorage.close();
    readerSettings.cancelPendingSaves();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});
