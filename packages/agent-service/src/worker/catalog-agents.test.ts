import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { YAML } from 'bun';
import { BUILTIN_TOOL_NAMES } from '@oh-my-pi/pi-coding-agent/tools/builtin-names';
import { Settings, resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { ModelRegistry } from '@oh-my-pi/pi-coding-agent/config/model-registry';
import { loadBundledAgents } from '@oh-my-pi/pi-coding-agent/task/agents';
import { cfgExtendedContext } from '@oh-my-pi/pi-coding-agent/session/context-settings';
import { cfgTaskAgentModelOverrides } from '@oh-my-pi/pi-coding-agent/task/settings';
import { parseFrontmatter } from '@oh-my-pi/pi-utils';
import { NativeModels } from './catalog-models.ts';
import { NativeAgents } from './catalog-agents.ts';
import { nativeExtensionRoots, nativeModelsContext, openNativeRuntime } from './native-runtime.ts';
import { captureNativePolicy } from './native-policy-snapshot.ts';
import { StatelessWorker } from './stateless.ts';
import { WorkerSession } from './session.ts';

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
    await models.configureProvider({
      expectedRevision: '0', configuration: {
        providerId: 'm212-loopback', name: 'Loopback provider', endpoint: 'http://127.0.0.1:18080/v1', protocol: 'chat-completions', credentialRef: null,
      }
    }, '1');
    await models.configureModel({
      expectedRevision: '1', model: {
        modelId: 'm212-model', provider: 'm212-loopback', name: 'Loopback text', modalities: ['text'], contextWindow: 65536,
        maxOutputTokens: 256, reasoningEffortSupported: false, reasoningOptions: [], variants: [], toolsSupported: true, enabled: true, pricing: null,
      }
    }, '2');
    const agents = new NativeAgents({
      cwd, agentDirectory, models: runtime.models, modelRegistry: runtime.modelRegistry, settings: runtime.settings,
      extensionRoots: nativeExtensionRoots(runtime.settings), availableToolNames: () => BUILTIN_TOOL_NAMES
    });
    const agent = {
      agentId: 'm212-profile', name: 'Proof profile', description: 'Finite profile selection',
      model: { providerId: 'm212-loopback', modelId: 'm212-model' }, allowedTools: ['bash'], systemPromptOverride: 'M212_PROFILE_SELECTED_NATIVE_SYSTEM',
      thinkingLevel: 'medium' as const, spawns: ['scout'], blocking: false, advisor: true
    };
    await agents.create({ expectedRevision: '2', agent }, '3');
    expect(await agents.profile(agent.agentId)).toEqual(agent);
    const updatedAgent = { ...agent, name: 'Updated proof profile' };
    await agents.update({ expectedRevision: '3', agent: updatedAgent }, '4');
    const catalog = await agents.read('workspace_1', '4');
    expect(catalog.agents.find(entry => entry.agentId === agent.agentId)).toEqual(updatedAgent);
    cfgTaskAgentModelOverrides.set(runtime.settings, { [agent.agentId]: ['m212-loopback/m212-model'] });
    await runtime.settings.flush();
    await agents.update({ expectedRevision: '4', agent: { ...updatedAgent, model: null } }, '5');
    expect(cfgTaskAgentModelOverrides.get(runtime.settings)).toEqual({});
    expect((await agents.definition(agent.agentId)).model).toBeUndefined();
    await agents.delete({ expectedRevision: '5', agentId: agent.agentId }, '6');
    const afterDelete = await agents.read('workspace_1', '6');
    expect(afterDelete.agents.some(entry => entry.agentId === agent.agentId)).toBe(false);
  } finally {
    runtime.authStorage.close();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

test('an agent write creates a profile that can be read back', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-agent-write-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await Promise.all([cwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  try {
    const agents = new NativeAgents({
      cwd, agentDirectory, models: runtime.models, modelRegistry: runtime.modelRegistry, settings: runtime.settings,
      extensionRoots: nativeExtensionRoots(runtime.settings), availableToolNames: () => BUILTIN_TOOL_NAMES,
    });
    await agents.create({ expectedRevision: '0', agent: { agentId: 'test-owner', name: 'Test owner', description: 'Test proof', model: null, allowedTools: null } }, '1');
    const profile = await agents.profile('test-owner');
    expect(profile.agentId).toBe('test-owner');
    expect(profile.name).toBe('Test owner');
  } finally {
    runtime.authStorage.close();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

test('a description edit preserves native agent settings, selectors and prompt bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-agent-native-roundtrip-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  const directory = join(cwd, '.omp', 'agents');
  await Promise.all([directory, agentDirectory].map(path => mkdir(path, { recursive: true })));
  const file = join(directory, 'local-reviewer.md');
  const body = ' <!-- prompt starts here -->\nUse exact output.\n\n---\n\n  Indented line.  \n\n';
  const prefix = '<!-- native agent profile -->\n\n';
  await writeFile(file, `${prefix}---
name: local-reviewer
description: Original
model: ["@smol", "anthropic/claude-haiku-4-5:high"]
output: { type: object }
autoloadSkills: [git]
prewalk: true
structured: true
readSummarize: false
thinking-level: xhigh
x-custom: { value: "first\t<!-- literal -->" }
---${body}`);
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  try {
    const agents = new NativeAgents({
      cwd, agentDirectory, models: runtime.models, modelRegistry: runtime.modelRegistry, settings: runtime.settings,
      extensionRoots: nativeExtensionRoots(runtime.settings), availableToolNames: () => BUILTIN_TOOL_NAMES,
    });
    const overrides = { 'local-reviewer': ['@task', '@slow'] };
    cfgTaskAgentModelOverrides.set(runtime.settings, overrides);
    await runtime.settings.flush();
    const profile = await agents.profile('local-reviewer');
    await agents.update({ expectedRevision: '0', agent: { ...profile, description: 'Updated' } }, '1');
    const stored = await readFile(file, 'utf8');
    expect(stored.startsWith(prefix)).toBe(true);
    expect(stored.endsWith(`---${body}`)).toBe(true);
    expect(parseFrontmatter(stored.slice(prefix.length), { rawKeys: true, repair: false }).frontmatter).toMatchObject({
      description: 'Updated',
      model: ['@smol', 'anthropic/claude-haiku-4-5:high'],
      output: { type: 'object' },
      autoloadSkills: ['git'],
      prewalk: true,
      structured: true,
      readSummarize: false,
      'thinking-level': 'xhigh',
      'x-custom': { value: 'first\t<!-- literal -->' },
    });
    expect(cfgTaskAgentModelOverrides.get(runtime.settings)).toEqual(overrides);
    expect((await agents.definition('local-reviewer')).model).toEqual(['@task', '@slow']);
    const { thinkingLevel, ...updated } = await agents.profile('local-reviewer');
    expect(thinkingLevel).toBe('xhigh');
    await agents.update({ expectedRevision: '1', agent: updated }, '2');
    expect((await agents.definition('local-reviewer')).thinkingLevel).toBeUndefined();
    const legacy = join(directory, 'legacy.md');
    const legacyContent = `${prefix}---\nname: legacy\ndescription: Unquoted: legacy title\n---\nPrompt\n`;
    await writeFile(legacy, legacyContent);
    const catalog = await agents.read('workspace_1', '2');
    expect(catalog.agents.map(agent => agent.agentId)).toContain('local-reviewer');
    const legacyProfile = await agents.profile('legacy');
    expect(legacyProfile.description).toBe('Unquoted: legacy title');
    await expect(agents.update({ expectedRevision: '2', agent: { ...legacyProfile, description: 'Changed' } }, '3')).rejects.toThrow();
    expect(await readFile(legacy, 'utf8')).toBe(legacyContent);
  } finally {
    runtime.authStorage.close();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

test('bundled profiles expose only tools installed in the native worker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-agent-capabilities-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  try {
    const agents = new NativeAgents({
      cwd, agentDirectory, models: runtime.models, modelRegistry: runtime.modelRegistry, settings: runtime.settings,
      extensionRoots: nativeExtensionRoots(runtime.settings),
      availableToolNames: () => ['read', 'grep', 'glob', 'web_search']
    });
    const catalog = await agents.read('workspace_1', '0');
    const scout = catalog.agents.find(agent => agent.agentId === 'scout');
    expect(scout?.allowedTools).toEqual(['read', 'grep', 'glob', 'web_search']);
  } finally {
    runtime.authStorage.close();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

test('an inherited agent copy retains the source model selectors separately from settings overrides', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-agent-inherited-model-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  const directory = join(agentDirectory, 'agents');
  await Promise.all([cwd, directory].map(path => mkdir(path, { recursive: true })));
  await writeFile(join(directory, 'my-agent.md'), '---\nname: my-agent\ndescription: User profile\nmodel: ["@smol", "@slow"]\n---\n');
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  try {
    const agents = new NativeAgents({
      cwd, agentDirectory, models: runtime.models, modelRegistry: runtime.modelRegistry, settings: runtime.settings,
      extensionRoots: nativeExtensionRoots(runtime.settings), availableToolNames: () => BUILTIN_TOOL_NAMES,
    });
    cfgTaskAgentModelOverrides.set(runtime.settings, { 'my-agent': '@task' });
    await runtime.settings.flush();
    const profile = await agents.profile('my-agent');
    await agents.update({ expectedRevision: '0', agent: { ...profile, description: 'Workspace copy' } }, '1');
    expect((await agents.definition('my-agent')).model).toEqual(['@task']);
    cfgTaskAgentModelOverrides.set(runtime.settings, {});
    await runtime.settings.flush();
    expect((await agents.definition('my-agent')).model).toEqual(['@smol', '@slow']);
  } finally {
    runtime.authStorage.close();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

test('canonical profiles distinguish inherit null, explicit none and exact arrays; raw tools:[] follows SDK append', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-agent-inherit-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  const available = ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'find', 'yield'];
  try {
    const agents = new NativeAgents({
      cwd, agentDirectory, models: runtime.models, modelRegistry: runtime.modelRegistry, settings: runtime.settings,
      extensionRoots: nativeExtensionRoots(runtime.settings), availableToolNames: () => available
    });
    const catalog = await agents.read('workspace_1', '0');
    for (const agentId of ['task', 'sonic']) {
      expect(catalog.agents.find(agent => agent.agentId === agentId)?.allowedTools).toBeNull();
    }
    expect(catalog.agents.find(agent => agent.agentId === 'scout')?.allowedTools).toEqual(['read', 'find', 'grep', 'glob']);
    const empty = { agentId: 'empty-tools', name: 'Empty tools', description: 'No model tools', model: null, allowedTools: [] };
    await agents.create({ expectedRevision: '0', agent: empty }, '1');
    expect(await agents.profile('empty-tools')).toEqual(empty);
    const inherited = { ...empty, agentId: 'inherit-tools', name: 'Inherit tools', allowedTools: null };
    await agents.create({ expectedRevision: '1', agent: inherited }, '2');
    expect(await agents.profile('inherit-tools')).toEqual(inherited);
    await mkdir(join(cwd, '.omp', 'agents'), { recursive: true });
    await writeFile(join(cwd, '.omp', 'agents', 'raw-empty.md'), '---\nname: raw-empty\ndescription: Raw empty tools\ntools: []\n---\n\nBody\n');
    // Raw native YAML without canonical metadata is parsed by the SDK, which preserves explicit empty tools list.
    expect((await agents.profile('raw-empty')).allowedTools).toEqual([]);
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
  const readerModels = new NativeModels({
    modelRegistry: readerRegistry,
    authStorage: runtime.authStorage,
    settings: readerSettings,
    modelsPath: runtime.modelsPath,
    oauthProviderIds: () => new Set<string>(),
    currentNativeSessionId: () => 'reader-session',
  });
  const owner = new NativeAgents({
    cwd, agentDirectory, models: runtime.models, modelRegistry: runtime.modelRegistry, settings: runtime.settings,
    extensionRoots: nativeExtensionRoots(runtime.settings), availableToolNames: () => BUILTIN_TOOL_NAMES
  });
  const reader = new NativeAgents({
    cwd, agentDirectory, models: readerModels, modelRegistry: readerRegistry, settings: readerSettings,
    extensionRoots: nativeExtensionRoots(readerSettings), availableToolNames: () => BUILTIN_TOOL_NAMES
  });
  const bundled = loadBundledAgents()[0];
  if (!bundled) throw new Error('Pinned native catalog must contain a bundled profile');
  try {
    expect((await reader.definition(bundled.name)).source).toBe('bundled');
    await owner.delete({ expectedRevision: '0', agentId: bundled.name }, '1');
    await expect(reader.definition(bundled.name)).rejects.toMatchObject({ status: 404 });
    expect((await reader.read('workspace_1', '1')).agents.some(agent => agent.agentId === bundled.name)).toBe(false);
    const replacement = {
      agentId: bundled.name, name: 'Replacement profile', description: 'Native project override',
      model: null, allowedTools: ['bash'], systemPromptOverride: 'Replacement native system prompt'
    };
    await owner.update({ expectedRevision: '1', agent: replacement }, '2');
    expect(await reader.profile(bundled.name)).toEqual(replacement);
  } finally {
    runtime.authStorage.close();
    readerSettings.cancelPendingSaves();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

test('a profile YAML carrying permissionPresetId is loaded by catalog and workers start', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legacy-preset-profile-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(join(cwd, '.omp', 'agents'), { recursive: true });
  await mkdir(agentDirectory, { recursive: true });

  const legacyProfileContent = `---
name: legacy-preset
description: Profile with legacy permissionPresetId
openchamber:
  agentId: legacy-preset
  name: Legacy Preset
  description: Profile with legacy permissionPresetId
  model: null
  allowedTools:
    - read
    - bash
  permissionPresetId: ask
---
You are an agent with legacy preset metadata.
`;
  await writeFile(join(cwd, '.omp', 'agents', 'legacy-preset.md'), legacyProfileContent, 'utf8');

  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  try {
    const agents = new NativeAgents({
      cwd, agentDirectory, models: runtime.models, modelRegistry: runtime.modelRegistry, settings: runtime.settings,
      extensionRoots: nativeExtensionRoots(runtime.settings), availableToolNames: () => BUILTIN_TOOL_NAMES
    });
    const catalog = await agents.read('workspace_1', '0');
    const legacy = catalog.agents.find(a => a.agentId === 'legacy-preset');
    expect(legacy).toBeDefined();
    expect(legacy?.name).toBe('Legacy Preset');
    expect(legacy?.allowedTools).toEqual(['read', 'bash']);
    expect(legacy ? 'permissionPresetId' in legacy : false).toBe(false);

    // Verify stateless worker starts on this workspace
    const statelessBootstrap = {
      type: 'completion.bootstrap' as const,
      workerGeneration: 'legacy-generation-1',
      authorizationRootId: 'legacy-root-1',
      workspaceId: 'workspace_1',
      projectId: 'project_1',
      cwd,
      agentDirectory,
      agentDirectoryId: 'source',
      catalogRevision: '0',
    };
    const statelessWorker = await StatelessWorker.open(statelessBootstrap, async () => ({ allowed: true }));
    expect(statelessWorker).toBeDefined();
    await statelessWorker.close();

    // Verify session worker starts on this workspace
    let publishedSnapshot = false;
    const sessionWorker = await WorkerSession.open({
      type: 'bootstrap',
      rootSessionId: 'legacy-session-root',
      workerGeneration: 'legacy-session-generation',
      projectId: 'project_1',
      workspaceId: 'workspace_1',
      agentDirectoryId: 'source',
      cwd,
      agentDirectory,
      sessionsDirectory: join(root, 'sessions'),
    }, () => { }, () => { }, () => { }, async () => ({ allowed: true }), async () => ({ ok: true }), (snapshot) => { publishedSnapshot = Boolean(snapshot); }, () => { });
    expect(sessionWorker).toBeDefined();
    expect(publishedSnapshot).toBe(true);
    await sessionWorker.close();
  } finally {
    runtime.authStorage.close();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

test('NativeAgents.read and captureNativePolicy skip reapplyModelPolicies when inputs are unchanged and reapply once per change', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-agents-policy-guard-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  const writerSettings = await Settings.loadIsolated({ cwd, agentDir: agentDirectory });
  const original = runtime.modelRegistry.reapplyModelPolicies.bind(runtime.modelRegistry);
  let reapplyCalls = 0;
  runtime.modelRegistry.reapplyModelPolicies = () => {
    reapplyCalls += 1;
    return original();
  };
  try {
    const agents = new NativeAgents({
      cwd, agentDirectory, models: runtime.models, modelRegistry: runtime.modelRegistry, settings: runtime.settings,
      extensionRoots: nativeExtensionRoots(runtime.settings), availableToolNames: () => BUILTIN_TOOL_NAMES,
    });
    const snapshotInput = { projectId: 'project_1', workspaceId: 'workspace_1', cwd, agentDirectory, agentDirectoryId: 'source' };
    await agents.read('workspace_1', '0');
    await captureNativePolicy(snapshotInput, runtime, agents, []);
    await agents.read('workspace_1', '0');
    await captureNativePolicy(snapshotInput, runtime, agents, []);
    expect(reapplyCalls).toBe(0);

    // Policy setting change triggers exactly one reapply across read and policy snapshot.
    cfgExtendedContext.set(writerSettings, !cfgExtendedContext.get(runtime.settings));
    await writerSettings.flush();
    await agents.read('workspace_1', '1');
    expect(reapplyCalls).toBe(1);
    await captureNativePolicy(snapshotInput, runtime, agents, []);
    expect(reapplyCalls).toBe(1);

    // models.yml change triggers exactly one reapply on captureNativePolicy, then stays at 0 on repeat reads.
    await writeFile(runtime.modelsPath, YAML.stringify({
      providers: {
        'agents-guard-loopback': {
          baseUrl: 'http://127.0.0.1:18080/v1',
          auth: 'none',
          api: 'openai-completions',
          models: [{ id: 'guard-model', name: 'Guard Model', contextWindow: 8192, maxTokens: 256 }],
        },
      },
    }), 'utf8');
    await captureNativePolicy(snapshotInput, runtime, agents, []);
    expect(reapplyCalls).toBe(2);
    await agents.read('workspace_1', '2');
    await captureNativePolicy(snapshotInput, runtime, agents, []);
    expect(reapplyCalls).toBe(2);
  } finally {
    runtime.authStorage.close();
    writerSettings.cancelPendingSaves();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});
