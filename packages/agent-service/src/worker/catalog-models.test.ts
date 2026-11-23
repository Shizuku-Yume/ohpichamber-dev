import { afterEach, beforeEach, expect, test } from 'bun:test';
import fs from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { YAML } from 'bun';
import { getBundledModel } from '@oh-my-pi/pi-catalog';
import { buildModel } from '@oh-my-pi/pi-catalog/build';
import { writeModelCache } from '@oh-my-pi/pi-catalog/model-cache';
import { resolveModelCacheProviderId } from '@oh-my-pi/pi-catalog/provider-models';
import { ModelRegistry } from '@oh-my-pi/pi-coding-agent/config/model-registry';
import { cfgDisabledProviders, cfgEnabledModels } from '@oh-my-pi/pi-coding-agent/config/model-settings';
import { filterAvailableModelsByEnabledPatterns } from '@oh-my-pi/pi-coding-agent/config/model-resolver';
import { Settings, resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { discoverAuthStorage } from '@oh-my-pi/pi-coding-agent/sdk';
import { cfgCompactionModelThresholds, cfgCompactionModelThresholdsEnabled, cfgExtendedContext } from '@oh-my-pi/pi-coding-agent/session/context-settings';
import { cfgDefaultThinkingLevel } from '@oh-my-pi/pi-coding-agent/session/settings';
import { NativeModels, credentialReference, publicModel, resolveProviderDisplayName, type NativeCatalogModel } from './catalog-models.ts';
import { openNativeRuntime, syncNativeConfigPair } from './native-runtime.ts';
import { getActiveProfile, getAgentDir, setProfile } from '@oh-my-pi/pi-utils';

const routed = getBundledModel('openrouter', 'openrouter/auto');

beforeEach(() => { delete process.env.OMP_PROFILE; delete process.env.PI_PROFILE; setProfile(''); resetSettingsForTest(); });
afterEach(() => { delete process.env.OMP_PROFILE; delete process.env.PI_PROFILE; setProfile(''); resetSettingsForTest(); });

async function openCatalogFixture() {
  const root = await mkdtemp(join(tmpdir(), 'catalog-models-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const writer = await openNativeRuntime({ cwd, agentDirectory });
  const settings = await Settings.loadIsolated({ cwd, agentDir: agentDirectory });
  const authStorage = await discoverAuthStorage(agentDirectory, { cwd, settings });
  const modelRegistry = new ModelRegistry(authStorage, writer.modelsPath, { settings });
  const models = new NativeModels({
    settings, authStorage, modelRegistry, modelsPath: writer.modelsPath,
    oauthProviderIds: () => new Set<string>(), currentNativeSessionId: () => 'reader-session'
  });
  return {
    writer, reader: { settings, modelRegistry, models }, async close() {
      authStorage.close();
      writer.authStorage.close();
      settings.cancelPendingSaves();
      resetSettingsForTest();
      await rm(root, { recursive: true, force: true });
    }
  };
}

const configuration = {
  providerId: 'm212-loopback', name: 'Loopback', endpoint: 'http://127.0.0.1:18080/v1',
  protocol: 'chat-completions' as const, credentialRef: null
};
test('model catalog publishes only executable providers while the provider directory stays complete', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-models-native-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const modelsPath = join(agentDirectory, 'models.yml');
  const nativeConfig = {
    providers: {
      'native-custom': {
        baseUrl: 'http://127.0.0.1:18080/v1', apiKey: 'native-test-key', api: 'openai-completions',
        models: [{ id: 'native-custom-model', name: 'Native custom', contextWindow: 65536, maxTokens: 256 }],
      },
      'native-keyless': {
        baseUrl: 'http://127.0.0.1:18081/v1', auth: 'none', api: 'openai-completions',
        models: [{ id: 'native-keyless-model', name: 'Native keyless', contextWindow: 65536, maxTokens: 256 }],
      },
    },
  };
  const authored = YAML.stringify(nativeConfig);
  await writeFile(modelsPath, authored);
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  try {
    const catalog = await runtime.models.readModels('workspace_1', '1');
    const catalogProviders = new Set(catalog.models.map(model => model.provider));
    expect(catalog.models.filter(model => model.provider === 'native-custom').map(model => model.modelId))
      .toEqual(['native-custom-model']);
    expect(catalog.models.filter(model => model.provider === 'native-keyless').map(model => model.modelId))
      .toEqual(['native-keyless-model']);
    // Every image generator the registry can execute is listed beside the
    // chat models, never inside them: it has no token limits to publish.
    expect(catalog.imageModels.every(model => !catalog.models.some(chat => chat.provider === model.provider && chat.modelId === model.modelId))).toBe(true);

    // The bundled registry still knows providers nobody configured. They must
    // not reach the executable model catalog.
    const unconfigured = [...new Set(runtime.modelRegistry.getAll('all').map(model => model.provider))]
      .find(provider => runtime.authStorage.keys.source(provider) === undefined && !runtime.authStorage.keys.keyless(provider));
    expect(unconfigured).toBeDefined();
    expect(catalogProviders.has(unconfigured!)).toBe(false);

    const directory = await runtime.models.readProviders('workspace_1', '1');
    expect(directory.providers.some(provider => provider.providerId === unconfigured)).toBe(true);
    expect(await readFile(modelsPath, 'utf8')).toBe(authored);
  } finally {
    runtime.authStorage.close();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

const configuredModel = {
  modelId: 'm212-model', provider: configuration.providerId, name: 'Loopback text', modalities: ['text' as const],
  contextWindow: 65536, maxOutputTokens: 256, reasoningEffortSupported: false, reasoningOptions: [], variants: [],
  toolsSupported: true, pricing: null
};

test('a long-lived native settings reader cannot select a deleted bundled provider', async () => {
  const fixture = await openCatalogFixture();
  const selection = { providerId: routed.provider, modelId: routed.id };
  try {
    expect((await fixture.reader.models.selection(selection)).nativeModel.api).toBe(routed.api);
    await fixture.writer.models.deleteProvider({ expectedRevision: '0', providerId: routed.provider }, '1');
    await expect(fixture.reader.models.selection(selection)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    const catalog = await fixture.reader.models.readModels('workspace_1', '1');
    expect(catalog.models.filter(model => model.provider === routed.provider).every(model => model.enabled === false)).toBe(true);
  } finally { await fixture.close(); }
});

test('model catalog reports whether the plan role resolves to an executable model', async () => {
  const fixture = await openCatalogFixture();
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration }, '1');
    await fixture.writer.models.configureModel({ expectedRevision: '1', model: configuredModel }, '2');
    expect((await fixture.reader.models.readModels('workspace_1', '2')).planRoleAvailable).toBe(false);
    fixture.reader.settings.setModelRole('plan', `${configuredModel.provider}/${configuredModel.modelId}`);
    await fixture.reader.settings.flush();
    expect((await fixture.reader.models.readModels('workspace_1', '3')).planRoleAvailable).toBe(true);
  } finally { await fixture.close(); }
});

test('provider protocol changes reach the actual native model selected by a long-lived reader', async () => {
  const fixture = await openCatalogFixture();
  const selection = { providerId: configuredModel.provider, modelId: configuredModel.modelId };
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration }, '1');
    await fixture.writer.models.configureModel({ expectedRevision: '1', model: configuredModel }, '2');
    expect((await fixture.reader.models.selection(selection)).nativeModel.api).toBe('openai-completions');
    await fixture.writer.models.configureProvider({ expectedRevision: '2', configuration: { ...configuration, protocol: 'responses' } }, '3');
    expect((await fixture.reader.models.selection(selection)).nativeModel.api).toBe('openai-responses');
    await fixture.writer.models.configureModel({ expectedRevision: '3', model: { ...configuredModel, name: 'Updated' } }, '4');
    expect((await fixture.reader.models.selection(selection)).nativeModel.api).toBe('openai-responses');
  } finally { await fixture.close(); }
});

test('native model selection accepts the explicit off reasoning level', async () => {
  const fixture = await openCatalogFixture();
  const reasoningModel = {
    ...configuredModel, reasoningEffortSupported: true,
    reasoningOptions: [{ reasoningEffort: 'high', label: 'High', budgetTokens: null }]
  };
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration }, '1');
    await fixture.writer.models.configureModel({ expectedRevision: '1', model: reasoningModel }, '2');
    const selected = await fixture.reader.models.selection(
      { providerId: reasoningModel.provider, modelId: reasoningModel.modelId },
      { variant: null, reasoningEffort: 'off' },
    );
    expect(selected.reasoningEffort).toBeNull();
  } finally { await fixture.close(); }
});

test('protocol mutation migrates old generated APIs while preserving distinguishable native overrides', async () => {
  const fixture = await openCatalogFixture();
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration }, '1');
    await fixture.writer.models.configureModel({ expectedRevision: '1', model: configuredModel }, '2');
    const override = { ...configuredModel, modelId: 'explicit-override' };
    await fixture.writer.models.configureModel({ expectedRevision: '2', model: override }, '3');
    const persisted = YAML.parse(await readFile(fixture.writer.modelsPath, 'utf8'));
    const provider = persisted.providers[configuration.providerId];
    provider.models.find((model: { id: string }) => model.id === configuredModel.modelId).api = 'openai-completions';
    provider.models.find((model: { id: string }) => model.id === override.modelId).api = 'anthropic-messages';
    provider.models.push({ ...provider.models[0], id: 'native-owned', api: 'openai-completions' });
    await writeFile(fixture.writer.modelsPath, YAML.stringify(persisted));
    await fixture.writer.models.configureProvider({ expectedRevision: '3', configuration: { ...configuration, protocol: 'responses' } }, '4');
    expect((await fixture.reader.models.selection({ providerId: configuration.providerId, modelId: configuredModel.modelId })).nativeModel.api).toBe('openai-responses');
    expect((await fixture.reader.models.selection({ providerId: configuration.providerId, modelId: override.modelId })).nativeModel.api).toBe('anthropic-messages');
    expect((await fixture.reader.models.selection({ providerId: configuration.providerId, modelId: 'native-owned' })).nativeModel.api).toBe('openai-completions');
    await fixture.writer.models.configureModel({ expectedRevision: '4', model: override }, '5');
    expect((await fixture.reader.models.selection({ providerId: configuration.providerId, modelId: override.modelId })).nativeModel.api).toBe('anthropic-messages');
  } finally { await fixture.close(); }
});

test('disabling and deleting the last allowlisted model never enables unrelated native models', async () => {
  const fixture = await openCatalogFixture();
  const selection = { providerId: configuredModel.provider, modelId: configuredModel.modelId };
  const unrelated = { providerId: routed.provider, modelId: routed.id };
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration }, '1');
    await fixture.writer.models.configureModel({ expectedRevision: '1', model: configuredModel }, '2');
    cfgEnabledModels.set(fixture.writer.settings, [`${selection.providerId}/${selection.modelId}`]);
    await fixture.writer.settings.flush();
    expect((await fixture.reader.models.selection(selection)).nativeModel.id).toBe(selection.modelId);
    await expect(fixture.reader.models.selection(unrelated)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    await fixture.writer.models.configureModel({ expectedRevision: '2', model: { ...configuredModel, enabled: false } }, '3');
    await expect(fixture.reader.models.selection(selection)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    await expect(fixture.reader.models.selection(unrelated)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    expect(filterAvailableModelsByEnabledPatterns(fixture.reader.modelRegistry.getAll('all'),
      cfgEnabledModels.get(fixture.reader.settings), fixture.reader.settings)).toEqual([]);
    await fixture.writer.models.configureModel({ expectedRevision: '3', model: { ...configuredModel, enabled: true } }, '4');
    expect((await fixture.reader.models.selection(selection)).nativeModel.id).toBe(selection.modelId);
    await expect(fixture.reader.models.selection(unrelated)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    await fixture.writer.models.deleteModel({ expectedRevision: '4', selection }, '5');
    await expect(fixture.reader.models.selection(unrelated)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    expect(filterAvailableModelsByEnabledPatterns(fixture.reader.modelRegistry.getAll('all'),
      cfgEnabledModels.get(fixture.reader.settings), fixture.reader.settings)).toEqual([]);
    await fixture.writer.models.configureModel({ expectedRevision: '5', model: { ...configuredModel, enabled: true } }, '6');
    expect((await fixture.reader.models.selection(selection)).nativeModel.id).toBe(selection.modelId);
    await expect(fixture.reader.models.selection(unrelated)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
  } finally { await fixture.close(); }
});

test('model selection reapplies a changed native context policy even when models.yml is unchanged', async () => {
  const fixture = await openCatalogFixture();
  try {
    // Promotion targets route to another model; a published long-context tier
    // exercises this model's settings-dependent window without missing token limits.
    const published = getBundledModel('openai', 'gpt-5.6');
    const selection = { providerId: published.provider, modelId: published.id };
    cfgExtendedContext.set(fixture.writer.settings, false);
    await fixture.writer.settings.flush();
    const before = (await fixture.reader.models.selection(selection)).nativeModel.contextWindow;
    cfgExtendedContext.set(fixture.writer.settings, true);
    await fixture.writer.settings.flush();
    const after = (await fixture.reader.models.selection(selection)).nativeModel.contextWindow;
    expect(before).toBe(published.cost.longContext?.inputThreshold);
    expect(after).toBe(published.contextWindow);
    expect(after).toBeGreaterThan(before);
  } finally { await fixture.close(); }
});

test('a bundled automatic router remains selectable without publishing negative sentinel rates', () => {
  const model = publicModel(routed);
  expect(model.modelId).toBe('openrouter/auto');
  expect(model.contextWindow).toBe(routed.contextWindow);
  expect(model.pricing).toBeNull();
});

for (const pricingStatus of [undefined, 'unknown', 'included', 'variable'] as const) {
  test(`zero token rates with ${pricingStatus ?? 'absent'} pricing status do not claim a free model`, () => {
    const native: NativeCatalogModel = { ...routed, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, pricingStatus };
    expect(publicModel(native).pricing).toBeNull();
  });
}

test('explicitly free token pricing remains zero rather than unknown', () => {
  const native: NativeCatalogModel = { ...routed, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, pricingStatus: 'free' };
  expect(publicModel(native).pricing).toEqual({ inputPerMillionTokens: 0, outputPerMillionTokens: 0, cacheReadPerMillionTokens: 0, cacheWritePerMillionTokens: 0 });
});

test('a model publishes its own default effort only when it advertises that level', () => {
  const opportunities = { ...routed, thinking: { efforts: ['low', 'high'] as const, defaultLevel: 'high' } };
  expect(publicModel(opportunities as NativeCatalogModel).defaultReasoningEffort).toBe('high');

  // OMP resolves a level the model does not advertise to its own resolution,
  // so publishing it would make a picker claim a level a send never carries.
  const unadvertised = { ...routed, thinking: { efforts: ['low', 'high'] as const, defaultLevel: 'max' } };
  expect(publicModel(unadvertised as NativeCatalogModel).defaultReasoningEffort).toBeUndefined();

  // No published default is not the same as "off": a picker must fall back.
  const noDefault = { ...routed, thinking: { efforts: ['low', 'high'] as const } };
  expect(publicModel(noDefault as NativeCatalogModel).defaultReasoningEffort).toBeUndefined();
});

test('empty configured reasoning options inherit the native ladder and budgets', () => {
  const native = { ...routed, reasoning: true, thinking: { mode: 'effort', efforts: ['low', 'high'], effortBudgets: { low: 1024, high: 8192 }, defaultLevel: 'high' } } as NativeCatalogModel;
  const configured = { ...configuredModel, reasoningEffortSupported: true };
  const model = publicModel(native, configured);
  expect(model.reasoningOptions).toEqual([
    { reasoningEffort: 'low', label: 'low', budgetTokens: 1024 },
    { reasoningEffort: 'high', label: 'high', budgetTokens: 8192 },
  ]);
  expect(model.defaultReasoningEffort).toBe('high');
  expect(publicModel({ ...native, thinking: undefined }, configured).reasoningOptions).toEqual([]);
  expect(publicModel({ ...native, reasoning: false, thinking: undefined }, configuredModel).reasoningEffortSupported).toBe(false);
});

test('explicit configured reasoning options win without publishing an excluded native default', () => {
  const native = { ...routed, reasoning: true, thinking: { mode: 'effort', efforts: ['low', 'high'], defaultLevel: 'high' } } as NativeCatalogModel;
  const options = [{ reasoningEffort: 'low', label: 'Careful', budgetTokens: 2048 }];
  const model = publicModel(native, { ...configuredModel, reasoningEffortSupported: true, reasoningOptions: options });
  expect(model.reasoningOptions).toEqual(options);
  expect(model.defaultReasoningEffort).toBeUndefined();
});

test('fixed native pricing preserves each published token rate', () => {
  const native: NativeCatalogModel = { ...routed, cost: { input: 1, output: 2, cacheRead: 0.25, cacheWrite: 1.5 }, pricingStatus: undefined };
  expect(publicModel(native).pricing).toEqual({ inputPerMillionTokens: 1, outputPerMillionTokens: 2, cacheReadPerMillionTokens: 0.25, cacheWritePerMillionTokens: 1.5 });
});

for (const field of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) {
  test(`a negative ${field} sentinel makes the native rate card unknown`, () => {
    const native: NativeCatalogModel = { ...routed, cost: { input: 1, output: 2, cacheRead: 0.25, cacheWrite: 1.5, [field]: -1 }, pricingStatus: undefined };
    expect(publicModel(native).pricing).toBeNull();
  });
}

test.each([
  ['chat-completions', '', '/v1'],
  ['responses', '/', '/v1'],
  ['chat-completions', '/custom/v2', '/custom/v2'],
  ['messages', '', ''],
] as const)('%s endpoint "%s" shares its base path with model discovery and execution', async (protocol, inputPath, basePath) => {
  const requests: { path: string; authorization: string | null; custom: string | null }[] = [];
  const authHeader = protocol === 'messages' ? 'X-Api-Key' : 'Authorization';
  const headers = { [authHeader]: 'private-value', 'X-Private': '!literal-not-a-command' };
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0, fetch(request) {
      const path = new URL(request.url).pathname;
      requests.push({ path, authorization: request.headers.get(authHeader), custom: request.headers.get('x-private') });
      if (path !== `${basePath}/models`) return new Response(null, { status: 404 });
      return Response.json({ data: [{ id: configuredModel.modelId, name: 'Discovered' }] });
    }
  });
  const fixture = await openCatalogFixture();
  const origin = `http://127.0.0.1:${server.port}`;
  const input = { ...configuration, protocol, endpoint: `${origin}${inputPath}` };
  const saved = { ...input, endpoint: `${origin}${basePath}` };
  const discovery = { models: [{ modelId: configuredModel.modelId, name: 'Discovered' }] };
  try {
    expect(await fixture.writer.models.discoverProviderModels({ endpoint: input.endpoint, protocol, headers })).toEqual(discovery);
    const result = await fixture.writer.models.configureProvider({
      expectedRevision: '0', configuration: input, headers, models: [configuredModel]
    }, '1');
    expect(JSON.stringify(result)).not.toContain('private-value');
    const reopened = await fixture.reader.models.readProviderConfiguration(saved.providerId, '1');
    expect(reopened.configuration).toEqual(saved);
    expect(reopened.headerNames.sort()).toEqual(Object.keys(headers).sort());
    expect(reopened.models).toEqual([configuredModel]);
    expect(JSON.stringify(reopened)).not.toContain('private-value');
    expect(JSON.stringify(await fixture.reader.models.readProviders('workspace_1', '1'))).not.toContain('private-value');
    const selection = await fixture.reader.models.selection({ providerId: saved.providerId, modelId: configuredModel.modelId });
    expect(selection.nativeModel.baseUrl).toBe(saved.endpoint);
    expect(await selection.nativeModel.resolveHeaders?.()).toMatchObject(headers);
    expect((await stat(fixture.writer.modelsPath)).mode & 0o777).toBe(0o600);
    expect(await fixture.reader.models.discoverProviderModels({ providerId: saved.providerId, endpoint: input.endpoint, protocol }))
      .toEqual(discovery);
    const expectedRequest = { path: `${basePath}/models`, authorization: 'private-value', custom: '!literal-not-a-command' };
    expect(requests).toEqual([expectedRequest, expectedRequest]);
    await fixture.writer.models.configureProvider({ expectedRevision: '1', configuration: { ...saved, name: 'Renamed' } }, '2');
    expect((await fixture.reader.models.readProviderConfiguration(saved.providerId, '2')).headerNames).toHaveLength(2);
    await fixture.writer.models.configureProvider({ expectedRevision: '2', configuration: saved, headers: {}, models: [] }, '3');
    expect(await fixture.reader.models.readProviderConfiguration(saved.providerId, '3')).toMatchObject({ headerNames: [], models: [] });
    await expect(fixture.reader.models.selection({ providerId: saved.providerId, modelId: configuredModel.modelId })).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
  } finally { server.stop(true); await fixture.close(); }
});

for (const protocol of ['chat-completions', 'responses', 'messages', 'generate-content'] as const) {
  test(`worker model discovery uses write-only ${protocol} authentication and real metadata`, async () => {
    const requests: Array<{ url: string; headers: Record<string, string> }> = [];
    const server = Bun.serve({
      hostname: '127.0.0.1', port: 0, fetch(request) {
        requests.push({ url: request.url, headers: Object.fromEntries(request.headers.entries()) });
        return Response.json(protocol === 'generate-content'
          ? { models: [{ name: 'models/loopback-model', displayName: 'Loopback', inputTokenLimit: 8192, outputTokenLimit: 1024 }] }
          : { data: [{ id: 'loopback-model', name: 'Loopback' }] });
      }
    });
    const fixture = await openCatalogFixture();
    try {
      const discovered = await fixture.reader.models.discoverProviderModels({
        endpoint: `http://127.0.0.1:${server.port}/v1`, protocol,
        apiKey: 'write-only-secret', headers: { 'x-private': 'write-only-header' }
      });
      const expectedModel = protocol === 'generate-content'
        ? { modelId: 'loopback-model', name: 'Loopback', contextWindow: 8192, maxOutputTokens: 1024 }
        : { modelId: 'loopback-model', name: 'Loopback' };
      expect(discovered).toEqual({ models: [expectedModel] });
      expect(requests).toHaveLength(1);
      expect(new URL(requests[0]!.url).pathname).toBe('/v1/models');
      const headerName = protocol === 'messages' ? 'x-api-key' : protocol === 'generate-content' ? 'x-goog-api-key' : 'authorization';
      expect(requests[0]!.headers[headerName]).toBe(headerName === 'authorization' ? 'Bearer write-only-secret' : 'write-only-secret');
      expect(requests[0]!.headers['x-private']).toBe('write-only-header');
      if (protocol === 'messages') expect(requests[0]!.headers['anthropic-version']).toBe('2023-06-01');
      expect(JSON.stringify(discovered)).not.toContain('write-only');
      expect(await readFile(fixture.writer.modelsPath, 'utf8').catch(() => '')).not.toContain('write-only');
    } finally { server.stop(true); await fixture.close(); }
  });
}

test('selected stored account survives reopen and changes the actual native credential binding', async () => {
  const fixture = await openCatalogFixture();
  try {
    await fixture.writer.authStorage.credentials.upsert(configuration.providerId, { type: 'api_key', key: 'first-loopback-key', source: 'login' });
    await fixture.writer.authStorage.credentials.upsert(configuration.providerId, { type: 'api_key', key: 'second-loopback-key', source: 'login' });
    await fixture.writer.authStorage.credentials.reload();
    const rows = fixture.writer.authStorage.credentials.list(configuration.providerId);
    const first = rows.find(row => row.credential.type === 'api_key' && row.credential.key === 'first-loopback-key')!;
    const second = rows.find(row => row.credential.type === 'api_key' && row.credential.key === 'second-loopback-key')!;
    const firstRef = credentialReference(configuration.providerId, first.id);
    const secondRef = credentialReference(configuration.providerId, second.id);
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration, models: [configuredModel] }, '1');
    await fixture.writer.models.selectCredential(configuration.providerId, secondRef, '2');
    await fixture.reader.models.selection({ providerId: configuration.providerId, modelId: configuredModel.modelId });
    expect(fixture.reader.models.defaultCredentialRef(configuration.providerId)).toBe(secondRef);
    expect(await fixture.reader.models.resolveProviderCredential(configuration.providerId, 'reader-session')).toEqual({
      bound: true, credential: { apiKey: 'second-loopback-key', credentialId: second.id },
    });
    await fixture.writer.models.selectCredential(configuration.providerId, firstRef, '3');
    expect(await fixture.reader.models.resolveProviderCredential(configuration.providerId, 'reader-session')).toEqual({
      bound: true, credential: { apiKey: 'first-loopback-key', credentialId: first.id },
    });
    await expect(fixture.writer.models.selectCredential(configuration.providerId, 'credential_missing', '4')).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    expect((await fixture.reader.models.readProviderConfiguration(configuration.providerId, '3')).configuration.credentialRef).toBe(firstRef);
  } finally { await fixture.close(); }
});

test('invalid bundled model write leaves the previous provider configuration and headers intact', async () => {
  const fixture = await openCatalogFixture();
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration, headers: { 'x-private': 'old-secret' }, models: [configuredModel] }, '1');
    const before = await readFile(fixture.writer.modelsPath, 'utf8');
    await expect(fixture.writer.models.configureProvider({
      expectedRevision: '1', configuration: { ...configuration, name: 'Uncommitted' },
      headers: { 'x-private': 'uncommitted-secret' }, models: [{
        ...configuredModel, reasoningEffortSupported: true,
        reasoningOptions: [{ reasoningEffort: 'not-native', label: 'Invalid', budgetTokens: null }]
      }]
    }, '2')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(await readFile(fixture.writer.modelsPath, 'utf8')).toBe(before);
    expect((await fixture.reader.models.readProviderConfiguration(configuration.providerId, '1')).configuration.name).toBe(configuration.name);
  } finally { await fixture.close(); }
});

test('discovery errors and redirects cannot reveal keys or forward credentials to another endpoint', async () => {
  let redirected = 0;
  const sink = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch() { redirected++; return Response.json({ data: [] }); } });
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0, fetch(request) {
      return new URL(request.url).pathname.startsWith('/redirect')
        ? Response.redirect(`http://127.0.0.1:${sink.port}/models`)
        : new Response('private-response-key', { status: 401 });
    }
  });
  const fixture = await openCatalogFixture();
  try {
    for (const path of ['error', 'redirect']) {
      await expect(fixture.reader.models.discoverProviderModels({
        endpoint: `http://127.0.0.1:${server.port}/${path}`,
        protocol: 'responses', apiKey: 'private-response-key'
      })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', message: 'Provider model discovery failed' });
    }
    expect(redirected).toBe(0);
  } finally { server.stop(true); sink.stop(true); await fixture.close(); }
});

test('stored discovery credentials are opaque and saved headers do not follow endpoint edits', async () => {
  const requests: { path: string; key: string | null; custom: string | null }[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0, fetch(request) {
      requests.push({ path: new URL(request.url).pathname, key: request.headers.get('authorization'), custom: request.headers.get('x-private') });
      return Response.json({ data: [] });
    }
  });
  const fixture = await openCatalogFixture();
  const saved = { ...configuration, endpoint: `http://127.0.0.1:${server.port}/original` };
  try {
    await fixture.writer.authStorage.credentials.upsert(saved.providerId, { type: 'api_key', key: 'opaque-discovery-key', source: 'login' });
    await fixture.writer.authStorage.credentials.reload();
    const row = fixture.writer.authStorage.credentials.list(saved.providerId)[0]!;
    const reference = credentialReference(saved.providerId, row.id);
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration: { ...saved, credentialRef: reference }, headers: { 'x-private': 'saved-secret' } }, '1');
    await fixture.reader.models.discoverProviderModels({ providerId: saved.providerId, endpoint: saved.endpoint, protocol: saved.protocol });
    const changedEndpoint = `http://127.0.0.1:${server.port}/changed`;
    await fixture.reader.models.discoverProviderModels({ providerId: saved.providerId, endpoint: changedEndpoint, protocol: saved.protocol });
    await fixture.reader.models.discoverProviderModels({ providerId: saved.providerId, endpoint: changedEndpoint, protocol: saved.protocol, credentialRef: reference });
    expect(requests).toEqual([
      { path: '/original/models', key: 'Bearer opaque-discovery-key', custom: 'saved-secret' },
      { path: '/changed/models', key: null, custom: null },
      { path: '/changed/models', key: 'Bearer opaque-discovery-key', custom: null },
    ]);
    await expect(fixture.reader.models.discoverProviderModels({
      providerId: saved.providerId, endpoint: saved.endpoint,
      protocol: saved.protocol, credentialRef: 'credential_unknown'
    })).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(requests).toHaveLength(3);
  } finally { server.stop(true); await fixture.close(); }
});

for (const protocol of ['messages', 'generate-content'] as const) {
  test(`${protocol} model discovery follows native pagination without duplicate identities`, async () => {
    const pages: string[] = [];
    const server = Bun.serve({
      hostname: '127.0.0.1', port: 0, fetch(request) {
        const url = new URL(request.url);
        pages.push(url.search);
        const second = url.search !== '';
        return Response.json(protocol === 'messages'
          ? { data: second ? [{ id: 'model-one' }, { id: 'model-two' }] : [{ id: 'model-one' }], has_more: !second, last_id: 'model-one' }
          : second ? { models: [{ name: 'models/model-one' }, { name: 'models/model-two' }] }
            : { models: [{ name: 'models/model-one' }], nextPageToken: 'page-two' });
      }
    });
    const fixture = await openCatalogFixture();
    try {
      const result = await fixture.reader.models.discoverProviderModels({ endpoint: `http://127.0.0.1:${server.port}/v1`, protocol });
      expect(result.models.map(model => model.modelId)).toEqual(['model-one', 'model-two']);
      expect(pages).toEqual(['', protocol === 'messages' ? '?after_id=model-one' : '?pageToken=page-two']);
    } finally { server.stop(true); await fixture.close(); }
  });
}

test('a model addressed by thinking effort accepts its effort name as the variant', async () => {
  const fixture = await openCatalogFixture();
  const model = {
    ...configuredModel,
    reasoningEffortSupported: true,
    reasoningOptions: [
      { reasoningEffort: 'low', label: 'low', budgetTokens: null },
      { reasoningEffort: 'medium', label: 'medium', budgetTokens: null },
      { reasoningEffort: 'high', label: 'high', budgetTokens: null },
    ],
  };
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration }, '1');
    await fixture.writer.models.configureModel({ expectedRevision: '1', model }, '2');
    // Settings name a thinking level as `provider/model:high`, arriving as `variant`.
    const selected = await fixture.reader.models.selection(
      { providerId: configuration.providerId, modelId: model.modelId },
      { variant: 'high' },
    );
    expect(selected.reasoningEffort).toBe('high');
    expect(selected.publicModel.variants).toEqual([]);
    await expect(fixture.reader.models.selection(
      { providerId: configuration.providerId, modelId: model.modelId },
      { variant: 'turbo' },
    )).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
    await expect(fixture.reader.models.selection(
      { providerId: configuration.providerId, modelId: model.modelId },
      { variant: 'high', reasoningEffort: 'low' },
    )).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
  } finally { await fixture.close(); }
});

test('default stored credential selection never replaces a source-owned native override', async () => {
  const fixture = await openCatalogFixture();
  try {
    await fixture.writer.authStorage.credentials.upsert(configuration.providerId, { type: 'api_key', key: 'stored-key', source: 'login' });
    await fixture.writer.authStorage.credentials.reload();
    const row = fixture.writer.authStorage.credentials.list(configuration.providerId)[0]!;
    await fixture.writer.models.selectCredential(configuration.providerId, credentialReference(configuration.providerId, row.id), '1');
    fixture.writer.authStorage.keys.setRuntime(configuration.providerId, 'source-owned-key');
    expect(await fixture.writer.models.resolveProviderCredential(configuration.providerId, 'session')).toEqual({ bound: false });
    expect(fixture.writer.models.provider(configuration.providerId).auth).toMatchObject({ source: 'managed-environment' });
    expect(await fixture.writer.authStorage.keys.peek(configuration.providerId)).toBe('source-owned-key');
  } finally { await fixture.close(); }
});

test('configured discovery falls back to native key cascade when no explicit account is selected', async () => {
  const requests: Array<{ authorization: string | null }> = [];
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0, fetch(request) {
      requests.push({ authorization: request.headers.get('authorization') });
      return Response.json({ data: [] });
    }
  });
  const fixture = await openCatalogFixture();
  const saved = { ...configuration, endpoint: `http://127.0.0.1:${server.port}/v1`, credentialRef: null };
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration: saved }, '1');
    // Runtime overrides belong to one AuthStorage instance; persisted native keys
    // are the normal configure-then-key-write flow observed by the separate reader.
    await fixture.writer.authStorage.credentials.upsert(saved.providerId, { type: 'api_key', key: 'cascade-key', source: 'login' });
    await fixture.reader.models.discoverProviderModels({ providerId: saved.providerId, endpoint: saved.endpoint, protocol: saved.protocol });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.authorization).toBe('Bearer cascade-key');
  } finally { server.stop(true); await fixture.close(); }
});
test('models.yml-only providers resolve apiKey env names and literal headers at discovery without metadata', async () => {
  const requests: Array<{ path: string; authorization: string | null; custom: string | null }> = [];
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0, fetch(request) {
      const path = new URL(request.url).pathname;
      requests.push({
        path,
        authorization: request.headers.get('authorization'),
        custom: request.headers.get('x-native-header'),
      });
      if (path.startsWith('/unauth')) return new Response('unauthorized', { status: 401 });
      return Response.json({ data: [{ id: 'native-discovered' }] });
    }
  });
  const root = await mkdtemp(join(tmpdir(), 'catalog-models-discovery-native-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  const envName = 'TEST_FB15_MODELS_YML_API_KEY';
  const previousEnv = process.env[envName];
  process.env[envName] = 'env-resolved-secret';
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const modelsPath = join(agentDirectory, 'models.yml');
  const nativeEndpoint = `http://127.0.0.1:${server.port}`;
  const unauthEndpoint = `http://127.0.0.1:${server.port}/unauth/v1`;
  await writeFile(modelsPath, YAML.stringify({
    providers: {
      'native-env-provider': {
        baseUrl: nativeEndpoint,
        apiKey: envName,
        api: 'openai-responses',
        headers: { 'X-Native-Header': 'native-header-value' },
        models: [{ id: 'm-1', name: 'M1', api: 'openai-codex-responses', contextWindow: 8192, maxTokens: 1024 }],
      },
      'native-unset-key': {
        baseUrl: unauthEndpoint,
        apiKey: 'TEST_FB15_MODELS_YML_UNSET_KEY',
        api: 'openai-responses',
        models: [{ id: 'm-2', name: 'M2', api: 'openai-codex-responses', contextWindow: 8192, maxTokens: 1024 }],
      },
    },
  }));
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  try {
    const result = await runtime.models.discoverProviderModels({
      providerId: 'native-env-provider',
      endpoint: nativeEndpoint,
      protocol: 'responses',
    });
    expect(result.models.map(model => model.modelId)).toEqual(['native-discovered']);
    // Must not forward the native provider credential to a different endpoint.
    await runtime.models.discoverProviderModels({
      providerId: 'native-env-provider',
      endpoint: `http://127.0.0.1:${server.port}/other/v1`,
      protocol: 'responses',
    });
    expect(requests).toEqual([
      { path: '/models', authorization: 'Bearer env-resolved-secret', custom: 'native-header-value' },
      { path: '/other/v1/models', authorization: null, custom: null },
    ]);
    await runtime.models.configureProvider({
      expectedRevision: '0',
      configuration: {
        providerId: 'native-missing-key',
        name: 'Missing Key',
        endpoint: unauthEndpoint,
        protocol: 'responses',
        credentialRef: null,
      },
    }, '1');
    await expect(runtime.models.discoverProviderModels({
      providerId: 'native-missing-key',
      endpoint: unauthEndpoint,
      protocol: 'responses',
    })).rejects.toMatchObject({
      status: 422,
      code: 'CREDENTIAL_UNAVAILABLE',
      message: expect.stringContaining('No credential is available for native-missing-key'),
    });
    // A models.yml apiKey naming an unset variable resolves to literal text in
    // OMP; discovery must report the missing variable instead of blaming the endpoint.
    await expect(runtime.models.discoverProviderModels({
      providerId: 'native-unset-key',
      endpoint: unauthEndpoint,
      protocol: 'responses',
    })).rejects.toMatchObject({
      status: 422,
      code: 'CREDENTIAL_UNAVAILABLE',
      message: 'Provider native-unset-key has no credential: its models.yml apiKey names TEST_FB15_MODELS_YML_UNSET_KEY, which is not set. Set TEST_FB15_MODELS_YML_UNSET_KEY or save an API key.',
    });
  } finally {
    if (previousEnv === undefined) delete process.env[envName];
    else process.env[envName] = previousEnv;
    server.stop(true);
    runtime.authStorage.close();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

test('environment-backed providers publish the variable name and keep it visible when a stored key wins', async () => {
  const fixture = await openCatalogFixture();
  const previous = process.env.OPENAI_API_KEY;
  try {
    process.env.OPENAI_API_KEY = 'env-only-openai-key';
    expect(fixture.reader.models.provider('openai').auth).toEqual({
      status: 'configured', credentialRef: expect.any(String), method: 'api-key',
      source: 'external-environment', environment: { variable: 'OPENAI_API_KEY', active: true },
    });
    // The projection carries the variable's name and never its value.
    expect(JSON.stringify(await fixture.reader.models.readProviders('workspace_1', '1'))).not.toContain('env-only-openai-key');
    await fixture.writer.authStorage.credentials.upsert('openai', { type: 'api_key', key: 'stored-openai-key', source: 'login' });
    await fixture.writer.authStorage.credentials.reload();
    expect(fixture.writer.models.provider('openai').auth).toMatchObject({
      source: 'stored-credential', environment: { variable: 'OPENAI_API_KEY', active: false },
    });
    // A blank variable is absent, not an empty source.
    process.env.OPENAI_API_KEY = '';
    expect(fixture.writer.models.provider('openai').auth).not.toHaveProperty('environment');
    // A provider with no environment mechanism says nothing about one.
    await fixture.writer.authStorage.credentials.upsert('campus-2', { type: 'api_key', key: 'campus-key', source: 'login' });
    await fixture.writer.authStorage.credentials.reload();
    expect(fixture.writer.models.provider('campus-2').auth).toMatchObject({ status: 'configured', source: 'stored-credential' });
    expect(fixture.writer.models.provider('campus-2').auth).not.toHaveProperty('environment');
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
    await fixture.close();
  }
});

test('a computed env resolver reports presence without inventing a single variable name', async () => {
  const fixture = await openCatalogFixture();
  const previous = process.env.HF_TOKEN;
  try {
    process.env.HF_TOKEN = 'env-only-huggingface-token';
    expect(fixture.reader.models.provider('huggingface').auth).toMatchObject({
      status: 'configured', source: 'external-environment', environment: { variable: null, active: true },
    });
  } finally {
    if (previous === undefined) delete process.env.HF_TOKEN; else process.env.HF_TOKEN = previous;
    await fixture.close();
  }
});

test('a provider identity containing a selector separator is refused before any write', async () => {
  const fixture = await openCatalogFixture();
  try {
    for (const providerId of ['campus/2', 'campus/', '/campus']) {
      await expect(fixture.writer.models.configureProvider({
        expectedRevision: '0', configuration: { ...configuration, providerId },
      }, '1')).rejects.toMatchObject({ status: 422, code: 'INVALID_REQUEST' });
    }
    expect(await readFile(fixture.writer.modelsPath, 'utf8').catch(() => '')).not.toContain('campus');
  } finally { await fixture.close(); }
});

test('a custom base URL query string survives discovery and the native baseUrl write', async () => {
  const requests: string[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0, fetch(request) {
      requests.push(request.url);
      return Response.json({ data: [{ id: 'azure-model', name: 'Azure' }] });
    }
  });
  const fixture = await openCatalogFixture();
  const endpoint = `http://127.0.0.1:${server.port}/v1?api-version=2024-10-21`;
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration: { ...configuration, endpoint } }, '1');
    expect(await fixture.writer.models.discoverProviderModels({ endpoint, protocol: 'chat-completions' }))
      .toEqual({ models: [{ modelId: 'azure-model', name: 'Azure' }] });
    const requested = new URL(requests[0]!);
    // `/models` belongs to the pathname; the query stays behind it.
    expect(requested.pathname).toBe('/v1/models');
    expect(requested.search).toBe('?api-version=2024-10-21');
    const persisted = YAML.parse(await readFile(fixture.writer.modelsPath, 'utf8'));
    expect(persisted.providers[configuration.providerId].baseUrl).toBe(endpoint);
    expect((await fixture.reader.models.readProviderConfiguration(configuration.providerId, '1')).configuration.endpoint).toBe(endpoint);
  } finally { server.stop(true); await fixture.close(); }
});

test('explicit empty headers replace old native provider headers and remain empty after reopen', async () => {
  const fixture = await openCatalogFixture();
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration, headers: { 'x-old': 'old-secret' } }, '1');
    await fixture.writer.models.configureProvider({ expectedRevision: '1', configuration, headers: {} }, '2');
    const reopened = await fixture.reader.models.readProviderConfiguration(configuration.providerId, '2');
    expect(reopened.headerNames).toEqual([]);
    const persisted = YAML.parse(await readFile(fixture.writer.modelsPath, 'utf8'));
    expect(persisted.providers[configuration.providerId].headers).toBeUndefined();
    expect(persisted.openchamber.providerHeaders[configuration.providerId]).toEqual({});
  } finally { await fixture.close(); }
});

test('model catalog carries the model and thinking level OMP resolves for a new session', async () => {
  const fixture = await openCatalogFixture();
  try {
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration }, '1');
    const reasoning = {
      ...configuredModel, reasoningEffortSupported: true,
      reasoningOptions: ['low', 'medium', 'high'].map(reasoningEffort => ({ reasoningEffort, label: reasoningEffort, budgetTokens: null }))
    };
    await fixture.writer.models.configureModel({ expectedRevision: '1', model: reasoning }, '2');
    fixture.reader.settings.setModelRole('default', `${configuredModel.provider}/${configuredModel.modelId}`);
    cfgDefaultThinkingLevel.override(fixture.reader.settings, 'medium');
    const catalog = await fixture.reader.models.readModels('workspace_1', '1');
    expect(catalog.defaults).toEqual({ model: { providerId: configuredModel.provider, modelId: configuredModel.modelId }, thinkingLevel: 'medium' });
    fixture.reader.settings.setModelRole('default', `${configuredModel.provider}/${configuredModel.modelId}:high`);
    expect((await fixture.reader.models.readModels('workspace_1', '1')).defaults.thinkingLevel).toBe('high');
  } finally { await fixture.close(); }
}, 30000);

test('canonical agentDirectory models.yml is resolved without scanning parent directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'omp-canonical-models-'));
  const cwd = join(root, 'workspace');
  const agentDir = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDir, { recursive: true });
  // Write a parent models.yml that must NOT be picked up
  await writeFile(join(root, 'models.yml'), 'providers:\n  parent:\n    baseUrl: http://127.0.0.1:9000\n');

  try {
    const runtime = await openNativeRuntime({ cwd, agentDirectory: agentDir });
    expect(runtime.modelsPath).toBe(join(agentDir, 'models.yml'));
    runtime.authStorage.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('syncNativeConfigPair discovers root config.yml and adopts/copies agent config.yml from root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'omp-config-pair-'));
  const agentDir = join(root, 'agent');
  const rootConfig = join(root, 'config.yml');
  await writeFile(rootConfig, 'shell: /bin/bash\n');
  try {
    const pair = syncNativeConfigPair(agentDir);
    expect(pair.modelsPath).toBe(join(agentDir, 'models.yml'));
    const agentConfig = join(agentDir, 'config.yml');
    expect(await readFile(agentConfig, 'utf8')).toContain('shell: /bin/bash');
    expect(fs.lstatSync(agentConfig).isSymbolicLink()).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('syncNativeConfigPair does not check parent when agentDirectory is not an agent subfolder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'omp-custom-pair-'));
  const customDir = join(root, 'custom');
  const rootModels = join(root, 'models.yml');
  await writeFile(rootModels, 'providers:\n  custom:\n    baseUrl: http://127.0.0.1:9000\n');
  try {
    const pair = syncNativeConfigPair(customDir);
    expect(pair.modelsPath).toBe(join(customDir, 'models.yml'));
    expect(await readFile(join(customDir, 'models.yml')).catch(() => null)).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('syncNativeConfigPair migrates root models.json into canonical agent models.yml without symlink or parent write', async () => {
  const root = await mkdtemp(join(tmpdir(), 'omp-models-json-pair-'));
  const agentDir = join(root, 'agent');
  const rootModelsJson = join(root, 'models.json');
  await writeFile(rootModelsJson, JSON.stringify({
    providers: {
      jsonprovider: { baseUrl: 'http://127.0.0.1:9090' }
    }
  }));
  try {
    const pair = syncNativeConfigPair(agentDir);
    expect(pair.modelsPath).toBe(join(agentDir, 'models.yml'));
    const agentModels = join(agentDir, 'models.yml');
    expect(await readFile(agentModels, 'utf8')).toContain('jsonprovider');
    const fileStat = await stat(agentModels);
    expect(fileStat.isFile()).toBe(true);
    expect(fileStat.mode & 0o777).toBe(0o600);
    expect(fs.lstatSync(agentModels).isSymbolicLink()).toBe(false);
    // Writing to agentModels modifies agent file, not parent json
    await writeFile(agentModels, 'providers:\n  updated:\n    baseUrl: http://127.0.0.1:9999\n');
    expect(await readFile(rootModelsJson, 'utf8')).toContain('jsonprovider');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('openNativeRuntime validates profile agentDirectory and activates requested profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'omp-profile-runtime-'));
  const cwd = join(root, 'workspace');
  await mkdir(cwd, { recursive: true });
  const profileName = `test-profile-${Date.now()}`;
  const oldProfile = process.env.OMP_PROFILE;
  process.env.OMP_PROFILE = profileName;
  setProfile(profileName);
  const expectedDerived = getAgentDir();
  await mkdir(expectedDerived, { recursive: true });
  try {
    const runtime = await openNativeRuntime({ cwd, agentDirectory: expectedDerived });
    expect(runtime.modelsPath).toBe(join(expectedDerived, 'models.yml'));
    expect(getAgentDir()).toBe(expectedDerived);
    runtime.authStorage.close();
    // If profile is set, mismatched agentDirectory throws clear error and never calls setAgentDir
    const mismatchedDir = join(root, 'mismatched-agent');
    await mkdir(mismatchedDir, { recursive: true });
    await expect(openNativeRuntime({ cwd, agentDirectory: mismatchedDir })).rejects.toThrow('Profile agent directory mismatch');

    // Without profile, input agentDirectory is authoritative and setAgentDir is called
    delete process.env.OMP_PROFILE;
    delete process.env.PI_PROFILE;
    setProfile('');
    const standaloneDir = join(root, 'standalone-agent');
    await mkdir(standaloneDir, { recursive: true });
    const standaloneRuntime = await openNativeRuntime({ cwd, agentDirectory: standaloneDir });
    expect(getAgentDir()).toBe(standaloneDir);
    expect(getActiveProfile()).toBeUndefined();
    standaloneRuntime.authStorage.close();
  } finally {
    if (oldProfile !== undefined) process.env.OMP_PROFILE = oldProfile;
    else delete process.env.OMP_PROFILE;
    delete process.env.PI_PROFILE;
    setProfile('');
    await rm(root, { recursive: true, force: true });
    await rm(dirname(expectedDerived), { recursive: true, force: true }).catch(() => { });
  }
});

test('resolveProviderDisplayName returns official names for well-known providers and catalog descriptors', () => {
  expect(resolveProviderDisplayName('302ai')).toBe('302.AI');
  expect(resolveProviderDisplayName('abacus')).toBe('Abacus.AI');
  expect(resolveProviderDisplayName('aihubmix')).toBe('AiHubMix');
  expect(resolveProviderDisplayName('anthropic')).toBe('Anthropic');
  expect(resolveProviderDisplayName('openai')).toBe('OpenAI');
  expect(resolveProviderDisplayName('google')).toContain('Google');
  expect(resolveProviderDisplayName('custom-provider', 'My Custom Provider')).toBe('My Custom Provider');
});

test('authoritative image model eligibility derives independently from chatModels candidate pool', async () => {
  const fixture = await openCatalogFixture();
  try {
    // Write an image model into models.yml
    await writeFile(fixture.writer.modelsPath, `
providers:
  fixture-image-provider:
    api: openai-responses
    baseUrl: https://api.example.com/v1
    auth: none
    models:
      - id: custom-generator-1
        name: Custom Generator 1
        kind: image
        api: openai-images
        input: [text]
      - id: custom-generator-disabled
        name: Custom Generator Disabled
        kind: image
        api: openai-images
        input: [text]
`);
    // Configure custom-generator-disabled with enabled: false in metadata
    await fixture.reader.models.configureImageModel({
      expectedRevision: '1',
      model: {
        modelId: 'custom-generator-disabled',
        provider: 'fixture-image-provider',
        name: 'Custom Generator Disabled',
        enabled: false,
      },
    }, '1');

    const catalog = await fixture.reader.models.readModels('workspace_1', '2');
    const enabledImg = catalog.imageModels.find(m => m.provider === 'fixture-image-provider' && m.modelId === 'custom-generator-1');
    const disabledImg = catalog.imageModels.find(m => m.provider === 'fixture-image-provider' && m.modelId === 'custom-generator-disabled');

    // custom-generator-1 is not in chatModels, yet is properly enabled in imageModels
    expect(enabledImg).toBeDefined();
    expect(enabledImg?.enabled).toBe(true);
    expect(catalog.models.some(m => m.provider === 'fixture-image-provider' && m.modelId === 'custom-generator-1')).toBe(false);

    // custom-generator-disabled has enabled: false
    expect(disabledImg).toBeDefined();
    expect(disabledImg?.enabled).toBe(false);

    // readProviderConfiguration includes imageModels in its read payload
    const providerConfig = await fixture.reader.models.readProviderConfiguration('fixture-image-provider', '2');
    expect(providerConfig.imageModels.map(m => m.modelId)).toContain('custom-generator-1');
    expect(providerConfig.imageModels.map(m => m.modelId)).toContain('custom-generator-disabled');

    // Generation predicate agrees: generating with disabled model fails with 422 MODEL_UNAVAILABLE
    await expect(fixture.reader.models.generate({
      workspaceId: 'workspace_1',
      selection: { providerId: 'fixture-image-provider', modelId: 'custom-generator-disabled' },
      prompt: 'Draw a cat',
    })).rejects.toThrow('Selected image model is disabled');

    // Test real local SDK provider execution via loopback server without credential cost
    const { createServer } = await import('node:http');
    let capturedBody = '';
    const mockServer = createServer(async (req, res) => {
      for await (const chunk of req) capturedBody += chunk;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        created: Date.now(),
        data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }]
      }));
    });
    await new Promise<void>(resolve => mockServer.listen(0, '127.0.0.1', resolve));
    const address = mockServer.address();
    if (address === null || typeof address === 'string') throw new Error('mock server did not bind a port');
    const port = address.port;
    try {
      // Re-write models.yml pointing custom-generator-1 to the mock server endpoint
      await writeFile(fixture.writer.modelsPath, `
providers:
  fixture-image-provider:
    api: openai-responses
    baseUrl: http://127.0.0.1:${port}/v1
    auth: none
    models:
      - id: custom-generator-1
        name: Custom Generator 1
        kind: image
        api: openai-images
        input: [text]
`);
      const generated = await fixture.reader.models.generate({
        workspaceId: 'workspace_1',
        selection: { providerId: 'fixture-image-provider', modelId: 'custom-generator-1' },
        prompt: 'Draw a cat',
      });
      expect(generated.model).toEqual({ providerId: 'fixture-image-provider', modelId: 'custom-generator-1' });
      expect(generated.images).toHaveLength(1);
      expect(generated.images[0].mimeType).toBe('image/png');
      expect(generated.images[0].data).toBe('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
      expect(capturedBody).toContain('Draw a cat');
    } finally {
      mockServer.close();
    }
  } finally {
    await fixture.close();
  }
});

test('bundled catalog metadata fills a known model id from the provider rows', async () => {
  const fixture = await openCatalogFixture();
  try {
    const result = await fixture.reader.models.enrichProviderModels({
      providerId: 'openai', models: [{ modelId: 'gpt-5.6' }],
    });
    expect(result.models).toEqual([{
      modelId: 'gpt-5.6',
      catalog: {
        source: 'omp-catalog', input: ['text', 'image'], contextWindow: 1050000, maxTokens: 128000,
        cost: { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 },
        reasoning: true,
        thinking: { mode: 'effort', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
        family: 'gpt',
      },
    }]);
  } finally { await fixture.close(); }
});

test('proxy reference matching resolves a bracket-affixed model id', async () => {
  const fixture = await openCatalogFixture();
  try {
    const result = await fixture.reader.models.enrichProviderModels({ models: [{ modelId: '[Kiro] claude-opus-4-6' }] });
    expect(result.models).toEqual([{
      modelId: '[Kiro] claude-opus-4-6',
      catalog: {
        source: 'omp-catalog', input: ['text', 'image'], contextWindow: 1000000, maxTokens: 128000,
        cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
        reasoning: true,
        thinking: { mode: 'anthropic-adaptive', efforts: ['low', 'medium', 'high', 'max'] },
        family: 'opus',
      },
    }]);
  } finally { await fixture.close(); }
});

test('an uncatalogued model id comes back without catalog metadata instead of failing', async () => {
  const fixture = await openCatalogFixture();
  try {
    const result = await fixture.reader.models.enrichProviderModels({
      providerId: 'm212-loopback', models: [{ modelId: 'not-a-catalogued-model' }],
    });
    expect(result).toEqual({ models: [{ modelId: 'not-a-catalogued-model' }] });
  } finally { await fixture.close(); }
});

test('discovery attaches catalog metadata to catalogued ids and stays one request', async () => {
  const requests: string[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0, fetch(request) {
      requests.push(new URL(request.url).pathname);
      return Response.json({ data: [{ id: 'claude-opus-4-6', name: 'Claude' }, { id: 'not-a-catalogued-model', name: 'Unknown' }] });
    }
  });
  const fixture = await openCatalogFixture();
  try {
    const result = await fixture.reader.models.discoverProviderModels({
      endpoint: `http://127.0.0.1:${server.port}/v1`, protocol: 'chat-completions',
    });
    expect(requests).toEqual(['/v1/models']);
    expect(result.models[0]).toMatchObject({ modelId: 'claude-opus-4-6', name: 'Claude', catalog: { source: 'omp-catalog', family: 'opus' } });
    expect(result.models[1]).toEqual({ modelId: 'not-a-catalogued-model', name: 'Unknown' });
  } finally { server.stop(true); await fixture.close(); }
});

function countPolicyReapplies(registry: ModelRegistry) {
  const original = registry.reapplyModelPolicies.bind(registry);
  let count = 0;
  registry.reapplyModelPolicies = () => {
    count += 1;
    return original();
  };
  return {
    get count() { return count; },
    reset() { count = 0; },
  };
}

test('20 unchanged model selections skip reapplyModelPolicies after runtime init and in unrefreshed readers', async () => {
  const selection = { providerId: routed.provider, modelId: routed.id };
  const root = await mkdtemp(join(tmpdir(), 'catalog-models-guard-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  const fixture = await openCatalogFixture();
  try {
    const runtimeSpy = countPolicyReapplies(runtime.modelRegistry);
    for (let i = 0; i < 20; i++) {
      expect((await runtime.models.selection(selection)).nativeModel.id).toBe(routed.id);
    }
    await runtime.models.readModels('workspace_1', '1');
    await runtime.models.readProviders('workspace_1', '1');
    expect(runtimeSpy.count).toBe(0);

    const readerSpy = countPolicyReapplies(fixture.reader.modelRegistry);
    // Unrefreshed ModelRegistry hydrates once on first use, then skips all subsequent unchanged selections.
    expect((await fixture.reader.models.selection(selection)).nativeModel.id).toBe(routed.id);
    expect(readerSpy.count).toBe(1);
    for (let i = 0; i < 20; i++) {
      expect((await fixture.reader.models.selection(selection)).nativeModel.id).toBe(routed.id);
    }
    expect(readerSpy.count).toBe(1);
  } finally {
    runtime.authStorage.close();
    await fixture.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('policy revision guard runs reapplyModelPolicies once per policy-relevant change and ignores unrelated settings', async () => {
  const fixture = await openCatalogFixture();
  const published = getBundledModel('openai', 'gpt-5.6');
  const selection = { providerId: published.provider, modelId: published.id };
  try {
    await fixture.writer.authStorage.credentials.upsert('openai', { type: 'api_key', key: 'test-openai-key', source: 'login' });
    await fixture.reader.models.readModels('workspace_1', '0');
    const spy = countPolicyReapplies(fixture.reader.modelRegistry);

    // Persisted policy setting change (config.yml) invalidates once.
    cfgExtendedContext.set(fixture.writer.settings, true);
    await fixture.writer.settings.flush();
    expect((await fixture.reader.models.selection(selection)).nativeModel.contextWindow).toBe(published.contextWindow);
    expect(spy.count).toBe(1);
    for (let i = 0; i < 5; i++) await fixture.reader.models.selection(selection);
    expect(spy.count).toBe(1);

    // In-memory setting override invalidates once and updates readModels too.
    cfgExtendedContext.override(fixture.reader.settings, false);
    expect((await fixture.reader.models.selection(selection)).nativeModel.contextWindow).toBe(published.cost.longContext?.inputThreshold);
    expect(spy.count).toBe(2);
    const catalogAfterOverride = await fixture.reader.models.readModels('workspace_1', '1');
    expect(catalogAfterOverride.models.find(m => m.provider === published.provider && m.modelId === published.id)?.contextWindow)
      .toBe(published.cost.longContext?.inputThreshold);
    expect(spy.count).toBe(2);
    // Compaction model thresholds policy setting invalidates once.
    cfgCompactionModelThresholdsEnabled.set(fixture.writer.settings, true);
    cfgCompactionModelThresholds.set(fixture.writer.settings, { 'openai/gpt-5.6': 'f500000' });
    await fixture.writer.settings.flush();
    await fixture.reader.models.selection(selection);
    expect(spy.count).toBe(3);

    // Disabled providers policy setting invalidates once.
    cfgDisabledProviders.set(fixture.writer.settings, ['anthropic']);
    await fixture.writer.settings.flush();
    await fixture.reader.models.selection(selection);
    expect(spy.count).toBe(4);

    // Unrelated setting change does not rebuild policies.
    cfgDefaultThinkingLevel.set(fixture.writer.settings, 'low');
    await fixture.writer.settings.flush();
    await fixture.reader.models.selection(selection);
    expect(spy.count).toBe(4);

    // Stored credential mutation invalidates once.
    await fixture.writer.authStorage.credentials.upsert(configuration.providerId, { type: 'api_key', key: 'cred-1', source: 'login' });
    await fixture.reader.models.selection(selection);
    expect(spy.count).toBe(5);
    await fixture.reader.models.selection(selection);
    expect(spy.count).toBe(5);

    // models.yml mutation invalidates once, then stabilizes.
    await fixture.writer.models.configureProvider({ expectedRevision: '0', configuration, models: [configuredModel] }, '1');
    expect((await fixture.reader.models.selection({ providerId: configuration.providerId, modelId: configuredModel.modelId })).nativeModel.api)
      .toBe('openai-completions');
    expect(spy.count).toBe(6);
    await fixture.reader.models.selection({ providerId: configuration.providerId, modelId: configuredModel.modelId });
    expect(spy.count).toBe(6);

    // readProviderConfiguration also reloads credentials and runs policy guard on external credential additions.
    await fixture.writer.authStorage.credentials.upsert(configuration.providerId, { type: 'api_key', key: 'cred-2', source: 'login' });
    await fixture.reader.models.readProviderConfiguration(configuration.providerId, '1');
    expect(spy.count).toBe(7);
  } finally {
    await fixture.close();
  }
});

test('failed reapplyModelPolicies does not advance the guard revision so a retry re-runs it', async () => {
  const fixture = await openCatalogFixture();
  const published = getBundledModel('openai', 'gpt-5.6');
  const selection = { providerId: published.provider, modelId: published.id };
  try {
    const original = fixture.reader.modelRegistry.reapplyModelPolicies.bind(fixture.reader.modelRegistry);
    let attempts = 0;
    let shouldFail = true;
    fixture.reader.modelRegistry.reapplyModelPolicies = async () => {
      attempts += 1;
      if (shouldFail) throw new Error('simulated policy rebuild failure');
      return await original();
    };

    cfgExtendedContext.set(fixture.writer.settings, true);
    await fixture.writer.settings.flush();
    await expect(fixture.reader.models.selection(selection)).rejects.toThrow('simulated policy rebuild failure');
    expect(attempts).toBe(1);

    shouldFail = false;
    expect((await fixture.reader.models.selection(selection)).nativeModel.contextWindow).toBe(published.contextWindow);
    expect(attempts).toBe(2);

    await fixture.reader.models.selection(selection);
    expect(attempts).toBe(2);
  } finally {
    await fixture.close();
  }
});

test('unrefreshed ModelRegistry hydrates credential-scoped SQLite model cache once while openNativeRuntime skips rebuilds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-models-cache-hydrate-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const apiKey = 'test-kimi-cache-key';
  const cachedModel = buildModel({
    id: 'kimi-cached-only',
    name: 'Kimi Cached Only',
    api: 'anthropic-messages',
    provider: 'kimi-code',
    baseUrl: 'https://api.kimi.com/coding/v1',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  });
  const cacheProviderId = resolveModelCacheProviderId('kimi-code', { apiKey });
  const cacheDbPath = join(agentDirectory, 'models.db');
  writeModelCache(cacheProviderId, Date.now(), [cachedModel], true, 'test-kimi-fingerprint', cacheDbPath);

  const seedSettings = await Settings.loadIsolated({ cwd, agentDir: agentDirectory });
  const seedAuth = await discoverAuthStorage(agentDirectory, { cwd, settings: seedSettings });
  try {
    await seedAuth.credentials.upsert('kimi-code', { type: 'api_key', key: apiKey, source: 'login' });
  } finally {
    seedAuth.close();
    seedSettings.cancelPendingSaves();
  }

  const runtime = await openNativeRuntime({ cwd, agentDirectory });
  const unrefreshedSettings = await Settings.loadIsolated({ cwd, agentDir: agentDirectory });
  const unrefreshedAuth = await discoverAuthStorage(agentDirectory, { cwd, settings: unrefreshedSettings });
  const unrefreshedRegistry = new ModelRegistry(unrefreshedAuth, runtime.modelsPath, { settings: unrefreshedSettings });
  const unrefreshedModels = new NativeModels({
    settings: unrefreshedSettings,
    authStorage: unrefreshedAuth,
    modelRegistry: unrefreshedRegistry,
    modelsPath: runtime.modelsPath,
    oauthProviderIds: () => new Set<string>(),
    currentNativeSessionId: () => 'unrefreshed-session',
  });
  const selection = { providerId: 'kimi-code', modelId: 'kimi-cached-only' };
  try {
    // openNativeRuntime already hydrated credential-scoped caches via refresh('offline').
    const runtimeSpy = countPolicyReapplies(runtime.modelRegistry);
    for (let i = 0; i < 20; i++) {
      expect((await runtime.models.selection(selection)).nativeModel.id).toBe('kimi-cached-only');
    }
    expect(runtimeSpy.count).toBe(0);

    // Synchronous ModelRegistry construction skips credential-scoped caches until first policy sync.
    expect(unrefreshedRegistry.find('kimi-code', 'kimi-cached-only')).toBeUndefined();
    const unrefreshedSpy = countPolicyReapplies(unrefreshedRegistry);
    expect((await unrefreshedModels.selection(selection)).nativeModel.id).toBe('kimi-cached-only');
    expect(unrefreshedSpy.count).toBe(1);
    for (let i = 0; i < 20; i++) {
      expect((await unrefreshedModels.selection(selection)).nativeModel.id).toBe('kimi-cached-only');
    }
    expect(unrefreshedSpy.count).toBe(1);
  } finally {
    runtime.authStorage.close();
    unrefreshedAuth.close();
    unrefreshedSettings.cancelPendingSaves();
    await rm(root, { recursive: true, force: true });
  }
});
test('lossless OMP 19.0.0 native provider round-trip preserves multi-protocol models, secrets, overrides, and built-in overrides', async () => {
  const fixture = await openCatalogFixture();
  try {
    process.env.OHPICHAMBER_TEST_GATEWAY_KEY = 'env-secret-value';
    const rawModelsYaml = [
      'providers:',
      '  CLIProxyAPI:',
      '    baseUrl: https://proxy.example/v1',
      '    apiKey: OHPICHAMBER_TEST_GATEWAY_KEY',
      '    authHeader: true',
      '    headers:',
      '      X-Gateway-Token: "!echo gateway-cmd-token"',
      '    discovery:',
      '      type: proxy',
      '      timeoutMs: 8000',
      '      advertisedReasoning: true',
      '    compat:',
      '      supportsStore: true',
      '      maxTokensField: max_completion_tokens',
      '    disableStrictTools: true',
      '    guardrailIdentifier: gr-123',
      '    guardrailVersion: DRAFT',
      '    guardrailTrace: enabled',
      '    requestMetadata:',
      '      team: core',
      '    remoteCompaction:',
      '      enabled: true',
      '      api: openai-responses',
      '      endpoint: https://compact.example/v1/compact',
      '    transport: pi-native',
      '    models:',
      '      - id: gpt-5.4',
      '        name: GPT 5.4',
      '        api: openai-codex-responses',
      '        kind: chat',
      '        baseUrl: https://proxy.example/codex',
      '        preferWebsockets: true',
      '        compat:',
      '          supportsStore: false',
      '        imageCountBudget: 4',
      '        contextWindow: 200000',
      '        maxContextWindow: 1000000',
      '        maxTokens: 32000',
      '        supportsTools: true',
      '        reasoning: true',
      '        thinking:',
      '          mode: effort',
      '          efforts:',
      '            - low',
      '            - medium',
      '            - high',
      '            - xhigh',
      '          defaultLevel: high',
      '          supportsDisplay: true',
      '        cost:',
      '          input: 2.5',
      '          output: 10',
      '          cacheRead: 0.25',
      '          cacheWrite: 1.25',
      '        headers:',
      '          X-Model-Auth: secret-model-header',
      '      - id: claude-sonnet-4-6',
      '        api: anthropic-messages',
      '        thinking:',
      '          mode: anthropic-adaptive',
      '          efforts:',
      '            - low',
      '            - high',
      '            - max',
      '          supportsDisplay: true',
      '      - id: gpt-image-1.5',
      '        api: openai-images',
      '        kind: image',
      '        supportsTools: false',
      '      - id: deepseek-r1',
      '        api: openai-completions',
      '        thinking:',
      '          mode: effort',
      '          efforts:',
      '            - low',
      '            - high',
      '          effortMap:',
      '            low: low',
      '            high: high',
      '          requiresEffort: true',
      '    modelOverrides:',
      '      gpt-5.4:',
      '        omitMaxOutputTokens: true',
      '        headers:',
      '          X-Override-Key: secret-override-header',
      '  openai:',
      '    modelOverrides:',
      '      gpt-5.6:',
      '        contextWindow: 400000',
      '        maxContextWindow: 1000000',
      '  bedrock-custom:',
      '    api: bedrock-converse-stream',
      '    baseUrl: https://bedrock-runtime.example',
      '    auth: none',
      '    guardrailIdentifier: gr-bedrock',
      '    models:',
      '      - id: anthropic.claude-sonnet',
      '  typesafe-custom:',
      '    api: typesafe',
      '    baseUrl: https://typesafe.example/v1',
      '    auth: none',
      '    models:',
      '      - id: judge-model',
      '',
    ].join('\n');
    await writeFile(fixture.writer.modelsPath, rawModelsYaml, 'utf8');

    // Read multi-protocol provider with omitted provider-level api without failing.
    const readGateway = await fixture.reader.models.readProviderConfiguration('CLIProxyAPI', '1');
    expect(readGateway.configuration).toMatchObject({ providerId: 'CLIProxyAPI', endpoint: 'https://proxy.example/v1' });
    // Read provider whose protocol is outside the legacy 4-protocol enum (configuration is null, native succeeds).
    const readBedrock = await fixture.reader.models.readProviderConfiguration('bedrock-custom', '1');
    expect(readBedrock.native).toMatchObject({
      providerId: 'bedrock-custom',
      api: 'bedrock-converse-stream',
      guardrailIdentifier: 'gr-bedrock',
    });
    const readTypesafe = await fixture.reader.models.readProviderConfiguration('typesafe-custom', '1');
    expect(readTypesafe.configuration).toBeNull();
    expect(readTypesafe.native).toMatchObject({
      providerId: 'typesafe-custom',
      api: 'typesafe',
    });
    expect(readGateway.native?.providerId).toBe('CLIProxyAPI');
    expect(readGateway.native?.isBuiltIn).toBe(false);
    expect(readGateway.native?.configApiKey).toEqual({ configured: true, source: 'env', envVar: 'OHPICHAMBER_TEST_GATEWAY_KEY' });
    expect(readGateway.native?.headerNames).toEqual(['X-Gateway-Token']);
    expect(readGateway.native?.models).toHaveLength(4);
    expect(readGateway.native?.models[0]).toMatchObject({
      id: 'gpt-5.4',
      api: 'openai-codex-responses',
      baseUrl: 'https://proxy.example/codex',
      preferWebsockets: true,
      compat: { supportsStore: false },
      imageCountBudget: 4,
      maxContextWindow: 1000000,
      headerNames: ['X-Model-Auth'],
    });
    expect(readGateway.native?.models[2]).toMatchObject({ id: 'gpt-image-1.5', api: 'openai-images', kind: 'image', supportsTools: false });
    expect(readGateway.native?.modelOverrides['gpt-5.4']).toMatchObject({
      omitMaxOutputTokens: true,
      headerNames: ['X-Override-Key'],
    });
    expect(JSON.stringify(readGateway)).not.toContain('gateway-cmd-token');
    expect(JSON.stringify(readGateway)).not.toContain('secret-model-header');
    expect(JSON.stringify(readGateway)).not.toContain('secret-override-header');
    expect(JSON.stringify(readGateway)).not.toContain('env-secret-value');

    // Save via native payload without touching apiKey or model/override headers -> preserves all secrets and fields.
    await fixture.writer.models.configureProvider({
      expectedRevision: '1',
      native: {
        providerId: 'CLIProxyAPI',
        name: 'CLI Proxy Gateway',
        baseUrl: 'https://proxy.example/v1',
        headersPatch: { set: { 'X-Extra-Header': 'enabled' } },
        models: [
          {
            id: 'gpt-5.4',
            name: 'GPT 5.4',
            api: 'openai-codex-responses',
            kind: 'chat',
            baseUrl: 'https://proxy.example/codex',
            preferWebsockets: true,
            compat: { supportsStore: false },
            imageCountBudget: 4,
            contextWindow: 200000,
            maxContextWindow: 1000000,
            maxTokens: 32000,
            supportsTools: true,
            reasoning: true,
            thinking: { mode: 'effort', efforts: ['low', 'medium', 'high', 'xhigh'], defaultLevel: 'high', supportsDisplay: true },
            cost: { input: 2.5, output: 10, cacheRead: 0.25, cacheWrite: 1.25 },
          },
          {
            id: 'claude-sonnet-4-6',
            api: 'anthropic-messages',
            thinking: { mode: 'anthropic-adaptive', efforts: ['low', 'high', 'max'], supportsDisplay: true },
          },
          { id: 'gpt-image-1.5', api: 'openai-images', kind: 'image', supportsTools: false },
          {
            id: 'deepseek-r1',
            api: 'openai-completions',
            thinking: { mode: 'effort', efforts: ['low', 'high'], effortMap: { low: 'low', high: 'high' }, requiresEffort: true },
          },
        ],
        modelOverrides: {
          'gpt-5.4': { omitMaxOutputTokens: true },
        },
      },
    }, '2');

    const persistedYaml = YAML.parse(await readFile(fixture.writer.modelsPath, 'utf8'));
    expect(persistedYaml.providers.CLIProxyAPI.apiKey).toBe('OHPICHAMBER_TEST_GATEWAY_KEY');
    expect(persistedYaml.providers.CLIProxyAPI.headers).toEqual({
      'X-Gateway-Token': '!echo gateway-cmd-token',
      'X-Extra-Header': 'enabled',
    });
    expect(persistedYaml.providers.CLIProxyAPI.discovery).toEqual({
      type: 'proxy',
      timeoutMs: 8000,
      advertisedReasoning: true,
    });
    expect(persistedYaml.providers.CLIProxyAPI.guardrailIdentifier).toBe('gr-123');
    expect(persistedYaml.providers.CLIProxyAPI.remoteCompaction).toEqual({
      enabled: true,
      api: 'openai-responses',
      endpoint: 'https://compact.example/v1/compact',
    });
    expect(persistedYaml.providers.CLIProxyAPI.transport).toBe('pi-native');
    expect(persistedYaml.providers.CLIProxyAPI.models[0].headers).toEqual({ 'X-Model-Auth': 'secret-model-header' });
    expect(persistedYaml.providers.CLIProxyAPI.models[0].api).toBe('openai-codex-responses');
    expect(persistedYaml.providers.CLIProxyAPI.models[0].baseUrl).toBe('https://proxy.example/codex');
    expect(persistedYaml.providers.CLIProxyAPI.models[0].preferWebsockets).toBe(true);
    expect(persistedYaml.providers.CLIProxyAPI.models[2].kind).toBe('image');
    expect(persistedYaml.providers.CLIProxyAPI.modelOverrides['gpt-5.4'].headers).toEqual({ 'X-Override-Key': 'secret-override-header' });
    expect(persistedYaml.providers.openai.modelOverrides['gpt-5.6']).toEqual({ contextWindow: 400000, maxContextWindow: 1000000 });

    // Built-in override-only provider reads cleanly without dumping bundled models and clears cleanly when emptied.
    const readOpenAi = await fixture.reader.models.readProviderConfiguration('openai', '2');
    expect(readOpenAi.native?.isBuiltIn).toBe(true);
    expect(readOpenAi.native?.hasNativeEntry).toBe(true);
    expect(readOpenAi.native?.models).toEqual([]);
    expect(readOpenAi.native?.modelOverrides['gpt-5.6']).toMatchObject({ contextWindow: 400000, maxContextWindow: 1000000 });

    await fixture.writer.models.configureProvider({
      expectedRevision: '2',
      native: {
        providerId: 'openai',
        modelOverrides: {},
      },
    }, '3');
    const afterClearYaml = YAML.parse(await readFile(fixture.writer.modelsPath, 'utf8'));
    expect(afterClearYaml.providers.openai).toBeUndefined();
  } finally {
    delete process.env.OHPICHAMBER_TEST_GATEWAY_KEY;
    await fixture.close();
  }
});
